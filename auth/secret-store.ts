import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Provides OS-level encryption for secrets.
 *
 * Production implementation wraps Electron's `safeStorage`, which uses the
 * platform's secure storage (DPAPI on Windows). Injecting it keeps this module
 * free of any Electron import so it stays testable in plain Node (spec §91).
 */
export interface Encryptor {
  isAvailable(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(ciphertext: Buffer): string
}

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<string[]>
}

/** Test/dev implementation. Never used for real credentials. */
export class InMemorySecretStore implements SecretStore {
  private readonly entries = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.entries.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key)
  }

  async list(): Promise<string[]> {
    return [...this.entries.keys()]
  }
}

interface SecretFile {
  version: 1
  entries: Record<string, string>
}

/**
 * Stores secrets as an OS-encrypted blob on disk.
 *
 * The file never contains plaintext: only base64 of the encryptor output, which
 * is produced by DPAPI-backed `safeStorage` in production. This satisfies the
 * "do NOT save OAuth tokens as plain JSON" requirement (spec §76).
 */
export class EncryptedFileSecretStore implements SecretStore {
  constructor(
    private readonly filePath: string,
    private readonly encryptor: Encryptor,
  ) {}

  private async read(): Promise<SecretFile> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as SecretFile
      if (parsed.version !== 1 || typeof parsed.entries !== 'object') {
        return { version: 1, entries: {} }
      }
      return parsed
    } catch {
      return { version: 1, entries: {} }
    }
  }

  private async write(file: SecretFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 })
  }

  private assertAvailable(): void {
    if (!this.encryptor.isAvailable()) {
      throw new Error('Secure OS storage is unavailable; refusing to store secrets in plaintext.')
    }
  }

  async get(key: string): Promise<string | null> {
    const file = await this.read()
    const encoded = file.entries[key]
    if (!encoded) return null
    this.assertAvailable()
    return this.encryptor.decrypt(Buffer.from(encoded, 'base64'))
  }

  async set(key: string, value: string): Promise<void> {
    this.assertAvailable()
    const file = await this.read()
    file.entries[key] = this.encryptor.encrypt(value).toString('base64')
    await this.write(file)
  }

  async delete(key: string): Promise<void> {
    const file = await this.read()
    if (key in file.entries) {
      delete file.entries[key]
      await this.write(file)
    }
  }

  async list(): Promise<string[]> {
    const file = await this.read()
    return Object.keys(file.entries)
  }
}

/** Redacts a secret for safe logging (spec §76, §87). */
export function redactSecret(value: string | null | undefined): string {
  if (!value) return '(none)'
  return `••••${value.slice(-4)}`
}

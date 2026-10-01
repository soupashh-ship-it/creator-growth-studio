import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EncryptedFileSecretStore,
  InMemorySecretStore,
  redactSecret,
  type Encryptor,
} from '@auth/secret-store'

/** Deterministic fake encryptor; stands in for Electron safeStorage in tests. */
const fakeEncryptor: Encryptor = {
  isAvailable: () => true,
  encrypt: (plaintext) => Buffer.from(`enc:${plaintext}`, 'utf8'),
  decrypt: (ciphertext) => ciphertext.toString('utf8').replace(/^enc:/, ''),
}

const unavailableEncryptor: Encryptor = {
  isAvailable: () => false,
  encrypt: () => {
    throw new Error('unavailable')
  },
  decrypt: () => {
    throw new Error('unavailable')
  },
}

let dir: string | undefined

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

describe('InMemorySecretStore', () => {
  it('stores, reads, lists and deletes', async () => {
    const store = new InMemorySecretStore()
    expect(await store.get('a')).toBeNull()
    await store.set('a', 'token-value')
    expect(await store.get('a')).toBe('token-value')
    expect(await store.list()).toEqual(['a'])
    await store.delete('a')
    expect(await store.get('a')).toBeNull()
  })
})

describe('EncryptedFileSecretStore', () => {
  it('round-trips a secret without ever writing plaintext', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cgs-secrets-'))
    const path = join(dir, 'secrets.json')
    const store = new EncryptedFileSecretStore(path, fakeEncryptor)

    await store.set('youtube/access', 'super-secret-token')

    const raw = await readFile(path, 'utf8')
    expect(raw).not.toContain('super-secret-token')
    expect(await store.get('youtube/access')).toBe('super-secret-token')
  })

  it('refuses to store secrets when OS encryption is unavailable', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cgs-secrets-'))
    const store = new EncryptedFileSecretStore(join(dir, 'secrets.json'), unavailableEncryptor)
    await expect(store.set('k', 'v')).rejects.toThrow(/unavailable/i)
  })
})

describe('redactSecret', () => {
  it('never reveals the full secret', () => {
    expect(redactSecret('abcdefghij')).toBe('••••ghij')
    expect(redactSecret(null)).toBe('(none)')
  })
})

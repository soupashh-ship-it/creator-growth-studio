import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { EncryptedFileSecretStore, type Encryptor, type SecretStore } from '../auth/secret-store'
import { AuthError } from '../auth/errors'

/**
 * OS-level encryption via Electron `safeStorage` (DPAPI on Windows).
 * Kept in the main process only — never exposed over IPC (spec §76).
 */
export const electronEncryptor: Encryptor = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plaintext) => safeStorage.encryptString(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
}

/**
 * Creates the app's secret store. Refuses to operate if OS encryption is
 * unavailable rather than silently falling back to plaintext (spec §76).
 */
export function createSecretStore(): SecretStore {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AuthError(
      'storage_unavailable',
      'OS secure storage is unavailable, so credentials cannot be stored safely.',
    )
  }
  const filePath = join(app.getPath('userData'), 'secrets.bin')
  return new EncryptedFileSecretStore(filePath, electronEncryptor)
}

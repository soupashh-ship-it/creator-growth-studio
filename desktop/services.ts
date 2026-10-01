import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openDatabase, type DatabaseSync } from '../database/connection'
import { runMigrations } from '../database/migrate'
import { migrations } from '../database/migrations'
import { Repositories } from '../database/repositories'
import { createProviderRegistry } from '../providers/registry'
import type { AIProvider, ProviderId } from '../providers/types'
import type { SecretStore } from '../auth/secret-store'
import { createSecretStore } from './secure-storage'

export interface AppServices {
  db: DatabaseSync
  repos: Repositories
  secretStore: SecretStore
  providers: Map<ProviderId, AIProvider>
}

let services: AppServices | null = null

/**
 * Lazily initializes the local database, secure storage and provider registry.
 * Runs migrations on first use so a fresh install is reproducible (spec §156).
 */
export function getServices(): AppServices {
  if (services) return services

  const dbPath = join(app.getPath('userData'), 'data', 'creators.db')
  mkdirSync(dirname(dbPath), { recursive: true })

  const db = openDatabase(dbPath)
  runMigrations(db, migrations)

  services = {
    db,
    repos: new Repositories(db),
    secretStore: createSecretStore(),
    providers: createProviderRegistry(),
  }
  return services
}

export function closeServices(): void {
  if (services) {
    services.db.close()
    services = null
  }
}

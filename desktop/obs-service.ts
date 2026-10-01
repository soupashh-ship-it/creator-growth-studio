import type { ObsHealth, ObsSnapshot } from '../core/obs/status'
import { ObsClient } from '../platforms/obs/client'
import { getServices } from './services'

const PASSWORD_KEY = 'integration/obs'

let client: ObsClient | null = null

/**
 * OBS service (spec §44). The WebSocket password lives in the OS-encrypted
 * secret store, never in the database or logs (§76).
 */
export async function obsConnect(password?: string): Promise<{ ok: boolean; error?: string }> {
  const { secretStore } = getServices()
  if (password) await secretStore.set(PASSWORD_KEY, password)
  const effective = password ?? (await secretStore.get(PASSWORD_KEY)) ?? undefined

  await client?.disconnect()
  client = new ObsClient(effective ? { password: effective } : {})
  return client.connect()
}

export async function obsHealth(): Promise<{ snapshot: ObsSnapshot; health: ObsHealth }> {
  if (!client) {
    const stored = await getServices().secretStore.get(PASSWORD_KEY)
    client = new ObsClient(stored ? { password: stored } : {})
    await client.connect()
  }
  return client.getHealth()
}

export async function obsDisconnect(): Promise<void> {
  await client?.disconnect()
  client = null
  await getServices().secretStore.delete(PASSWORD_KEY)
}

import { currentVersion } from '../database/migrate'
import { migrations } from '../database/migrations'
import type { AIProvider } from '../providers/types'
import { checkDependencies } from './dependencies'
import { getFfmpegStatus } from './ffmpeg-service'
import { getVectorStatus } from './knowledge-service'
import { getGoogleConfig, getTwitchConfig } from './platform-service'
import { getServices } from './services'

/**
 * Local acceptance self-check (spec §155).
 *
 * Runs the parts of the end-to-end flow that CAN be exercised on this machine —
 * database, migrations, providers, tools, feeds, credentials — and reports each
 * as `pass`, `fail` or `blocked`. "blocked" is used honestly for steps that need
 * a credential or data source the creator has not supplied yet (for example a
 * real Google OAuth client); it is never reported as a pass or a failure.
 */

export type CheckStatus = 'pass' | 'fail' | 'blocked'

export interface AcceptanceCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface AcceptanceReport {
  generatedAt: string
  checks: AcceptanceCheck[]
  passed: number
  failed: number
  blocked: number
}

async function providerHealth(provider: AIProvider): Promise<{ available: boolean; detail: string }> {
  try {
    const result = await Promise.race([
      provider.healthCheck(),
      new Promise<{ available: boolean; detail: string }>((resolve) =>
        setTimeout(() => resolve({ available: false, detail: 'health check timed out' }), 2500),
      ),
    ])
    return { available: result.available, detail: result.detail }
  } catch (error) {
    return { available: false, detail: error instanceof Error ? error.message : 'health check failed' }
  }
}

export async function runAcceptance(workspaceId: string): Promise<AcceptanceReport> {
  const { db, repos, providers } = getServices()
  const checks: AcceptanceCheck[] = []

  // 1. Migrations applied to the latest version.
  try {
    const expected = Math.max(...migrations.map((m) => m.version))
    const actual = currentVersion(db)
    checks.push({
      id: 'migrations',
      label: 'Database schema is current',
      status: actual === expected ? 'pass' : 'fail',
      detail: `Schema version ${actual} of ${expected}.`,
    })
  } catch (error) {
    checks.push({
      id: 'migrations',
      label: 'Database schema is current',
      status: 'fail',
      detail: error instanceof Error ? error.message : 'Could not read schema version.',
    })
  }

  // 2. Workspace exists.
  try {
    const workspaces = repos.listWorkspaces()
    const found = workspaces.some((workspace) => workspace.id === workspaceId)
    checks.push({
      id: 'workspace',
      label: 'Active workspace resolves',
      status: found ? 'pass' : 'fail',
      detail: found
        ? `Workspace “${workspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId}” is active.`
        : 'The active workspace is not present in the database.',
    })
  } catch (error) {
    checks.push({
      id: 'workspace',
      label: 'Active workspace resolves',
      status: 'fail',
      detail: error instanceof Error ? error.message : 'Could not list workspaces.',
    })
  }

  // 3. At least one AI provider is reachable.
  const providerEntries = [...providers.values()]
  const providerResults = await Promise.all(
    providerEntries.map(async (provider) => ({ provider, health: await providerHealth(provider) })),
  )
  const availableProviders = providerResults.filter((entry) => entry.health.available)
  checks.push({
    id: 'ai-providers',
    label: 'At least one AI provider is available',
    status: availableProviders.length > 0 ? 'pass' : 'blocked',
    detail:
      availableProviders.length > 0
        ? `Available: ${availableProviders.map((entry) => entry.provider.displayName).join(', ')}.`
        : providerResults.length === 0
          ? 'No AI providers are registered.'
          : `None reachable — ${providerResults.map((entry) => `${entry.provider.displayName}: ${entry.health.detail}`).join('; ')}`,
  })

  // 4. Optional tools.
  const deps = await checkDependencies()
  for (const [id, label] of [
    ['ffmpeg', 'FFmpeg (local clip export)'],
    ['ollama', 'Ollama (local models & embeddings)'],
    ['gemini-cli', 'Gemini CLI'],
    ['obs-websocket', 'OBS WebSocket'],
  ] as const) {
    const dep = deps.find((item) => item.id === id)
    checks.push({
      id: `tool-${id}`,
      label,
      status: dep?.present ? 'pass' : 'blocked',
      detail: dep?.detail ?? 'Not detected on this machine.',
    })
  }

  // 5. ffmpeg status detail (uses the configured path, not just PATH).
  const ffmpeg = getFfmpegStatus()
  checks.push({
    id: 'ffmpeg-detail',
    label: 'Clip export is usable',
    status: ffmpeg.present ? 'pass' : 'blocked',
    detail: ffmpeg.detail,
  })

  // 6. Local embeddings for semantic search.
  const vectors = getVectorStatus(workspaceId)
  checks.push({
    id: 'embeddings',
    label: 'Semantic knowledge search is available',
    status: vectors.available ? 'pass' : 'blocked',
    detail: vectors.detail,
  })

  // 7. Platform credentials (§155: real sign-in needs real registrations).
  for (const [id, label, configured, detail] of [
    ['google', 'Google/YouTube OAuth client', await getGoogleConfig(), 'Add a Google OAuth desktop client id to enable YouTube sign-in and the Analytics sync.'],
    ['twitch', 'Twitch application client id', await getTwitchConfig(), 'Register a Twitch application and add its client id to enable sign-in.'],
  ] as const) {
    checks.push({
      id: `credential-${id}`,
      label,
      status: configured ? 'pass' : 'blocked',
      detail: configured ? 'Configured.' : detail,
    })
  }

  const failed = checks.filter((check) => check.status === 'fail').length
  const blocked = checks.filter((check) => check.status === 'blocked').length
  return {
    generatedAt: new Date().toISOString(),
    checks,
    passed: checks.length - failed - blocked,
    failed,
    blocked,
  }
}

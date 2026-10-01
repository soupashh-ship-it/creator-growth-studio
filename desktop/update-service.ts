import { net } from 'electron'

/**
 * Update check (spec §88).
 *
 * Read-only: queries the GitHub Releases API for a tag newer than the running
 * version and reports it. The app NEVER downloads or installs anything by
 * itself — the user chooses to open the release page in their browser. This
 * keeps the local-first promise while giving the packaging story an update path.
 */

const REPO_OWNER = 'soupashh-ship-it'
const REPO_NAME = 'creator-growth-studio'

export interface UpdateCheckResult {
  ok: boolean
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  checkedAt: string
  error?: string
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const checkedAt = new Date().toISOString()
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
  try {
    const response = await net.fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return {
        ok: false,
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        checkedAt,
        error: `Release lookup failed (HTTP ${response.status}).`,
      }
    }
    const data = (await response.json()) as { tag_name?: string; html_url?: string }
    const latest = typeof data.tag_name === 'string' ? data.tag_name : null
    const updateAvailable = latest !== null && compareVersions(latest, currentVersion) > 0
    return {
      ok: true,
      currentVersion,
      latestVersion: latest,
      updateAvailable,
      releaseUrl: data.html_url ?? `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      checkedAt,
    }
  } catch (error) {
    return {
      ok: false,
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt,
      error: error instanceof Error ? error.message : 'Could not reach the release service.',
    }
  }
}

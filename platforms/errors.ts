import type { PlatformId } from './types'

/** Failure states shared with the UI (spec §81). */
export type PlatformErrorCode =
  | 'not_configured'
  | 'auth_expired'
  | 'rate_limited'
  | 'offline'
  | 'unavailable'
  | 'permission_missing'
  | 'quota_reached'
  | 'api_changed'

export class PlatformError extends Error {
  readonly code: PlatformErrorCode
  readonly platform: PlatformId
  readonly detail?: string

  constructor(code: PlatformErrorCode, platform: PlatformId, message: string, detail?: string) {
    super(message)
    this.name = 'PlatformError'
    this.code = code
    this.platform = platform
    if (detail !== undefined) this.detail = detail
  }
}

export function asPlatformError(error: unknown, platform: PlatformId): PlatformError {
  if (error instanceof PlatformError) return error
  return new PlatformError('unavailable', platform, error instanceof Error ? error.message : String(error))
}

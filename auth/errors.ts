/**
 * Typed auth failures. The UI maps these to the graceful states required by
 * spec §81 rather than showing raw exceptions.
 */
export type AuthErrorCode =
  | 'cancelled' // user closed the browser / denied consent
  | 'timeout' // no callback within the budget
  | 'state_mismatch' // CSRF check failed
  | 'missing_code' // callback had no authorization code
  | 'provider_error' // provider returned ?error=...
  | 'token_exchange_failed'
  | 'invalid_id_token'
  | 'storage_unavailable' // OS secure storage unavailable

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly detail?: string

  constructor(code: AuthErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

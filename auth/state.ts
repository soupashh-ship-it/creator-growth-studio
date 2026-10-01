import { randomBytes } from 'node:crypto'
import { base64UrlEncode } from './pkce'

/** Opaque, high-entropy CSRF `state` value (spec §91). */
export function createState(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes))
}

/** OIDC `nonce`, verified against the ID token (spec §91). */
export function createNonce(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes))
}

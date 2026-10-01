import { createHash, randomBytes } from 'node:crypto'

/** RFC 7636 PKCE pair using the recommended S256 method. */
export interface PkcePair {
  verifier: string
  challenge: string
  method: 'S256'
}

/** base64url without padding, per RFC 7636 §A. */
export function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** code_challenge = BASE64URL(SHA256(ASCII(verifier))). */
export function deriveChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest())
}

/**
 * Creates a fresh code verifier (43–128 chars) and its S256 challenge.
 * A new pair must be generated for every authorization request.
 */
export function createPkce(verifierBytes = 48): PkcePair {
  const verifier = base64UrlEncode(randomBytes(verifierBytes))
  return { verifier, challenge: deriveChallenge(verifier), method: 'S256' }
}

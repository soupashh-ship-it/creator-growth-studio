import { describe, expect, it } from 'vitest'
import { createPkce, deriveChallenge } from '@auth/pkce'

describe('PKCE', () => {
  it('matches the RFC 7636 Appendix B S256 test vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(deriveChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('creates a verifier of legal length with unreserved characters', () => {
    const { verifier, challenge, method } = createPkce()
    expect(method).toBe('S256')
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(challenge).not.toBe(verifier)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('produces a distinct verifier for every request', () => {
    const a = createPkce()
    const b = createPkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
})

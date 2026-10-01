import { afterEach, describe, expect, it } from 'vitest'
import { startLoopbackServer, type LoopbackServer } from '@auth/loopback'
import { createState, createNonce } from '@auth/state'
import { AuthError } from '@auth/errors'

let server: LoopbackServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('state & nonce', () => {
  it('are high-entropy and unique', () => {
    expect(createState()).not.toBe(createState())
    expect(createNonce()).not.toBe(createNonce())
    expect(createState()).toMatch(/^[A-Za-z0-9\-_]+$/)
  })
})

describe('loopback callback server', () => {
  it('accepts a valid callback and returns the code', async () => {
    const state = createState()
    server = await startLoopbackServer({ expectedState: state })
    const response = await fetch(`${server.redirectUri}?code=abc123&state=${state}`)
    expect(response.status).toBe(200)
    await expect(server.waitForCallback()).resolves.toEqual({ code: 'abc123', state })
  })

  it('rejects a mismatched state (CSRF protection)', async () => {
    server = await startLoopbackServer({ expectedState: 'expected-state' })
    const response = await fetch(`${server.redirectUri}?code=abc&state=attacker`)
    expect(response.status).toBe(400)
    await expect(server.waitForCallback()).rejects.toMatchObject({ code: 'state_mismatch' })
  })

  it('rejects a callback with no code', async () => {
    const state = createState()
    server = await startLoopbackServer({ expectedState: state })
    await fetch(`${server.redirectUri}?state=${state}`)
    await expect(server.waitForCallback()).rejects.toMatchObject({ code: 'missing_code' })
  })

  it('maps a denied consent to cancelled', async () => {
    const state = createState()
    server = await startLoopbackServer({ expectedState: state })
    await fetch(`${server.redirectUri}?error=access_denied&state=${state}`)
    await expect(server.waitForCallback()).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('ignores a replayed/cross-path request and still accepts the valid one', async () => {
    const state = createState()
    server = await startLoopbackServer({ expectedState: state })
    const wrongPath = await fetch(`${server.redirectUri.replace('/callback', '/other')}?code=x`)
    expect(wrongPath.status).toBe(404)
    await fetch(`${server.redirectUri}?code=good&state=${state}`)
    await expect(server.waitForCallback()).resolves.toMatchObject({ code: 'good' })
  })

  it('times out when no callback arrives', async () => {
    server = await startLoopbackServer({ expectedState: createState(), timeoutMs: 40 })
    await expect(server.waitForCallback()).rejects.toBeInstanceOf(AuthError)
    await expect(server.waitForCallback()).rejects.toMatchObject({ code: 'timeout' })
  })
})

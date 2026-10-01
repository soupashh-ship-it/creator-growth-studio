import { describe, expect, it, vi } from 'vitest'
import { Scheduler } from '@jobs/scheduler'

/** A controllable clock so no real timers are needed. */
function fakeClock(start = 1_000_000) {
  let value = start
  return { now: () => value, advance: (ms: number) => (value += ms) }
}

describe('Scheduler', () => {
  it('runs a newly registered task on the first tick, then respects the interval', async () => {
    const clock = fakeClock()
    const scheduler = new Scheduler(clock.now)
    const run = vi.fn(async () => undefined)
    scheduler.register({ name: 'sync', intervalMs: 1000, run })

    expect(await scheduler.tick()).toEqual(['sync'])
    expect(run).toHaveBeenCalledTimes(1)

    // Not due yet.
    expect(await scheduler.tick()).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)

    clock.advance(1000)
    expect(await scheduler.tick()).toEqual(['sync'])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('records an error without stopping other tasks or the loop', async () => {
    const clock = fakeClock()
    const scheduler = new Scheduler(clock.now)
    const good = vi.fn(async () => undefined)
    scheduler.register({
      name: 'bad',
      intervalMs: 0,
      run: async () => {
        throw new Error('boom')
      },
    })
    scheduler.register({ name: 'good', intervalMs: 0, run: good })

    const ran = await scheduler.tick()
    expect(ran.sort()).toEqual(['bad', 'good'])
    expect(good).toHaveBeenCalledTimes(1)

    const bad = scheduler.list().find((t) => t.name === 'bad')
    expect(bad?.lastError).toBe('boom')
  })

  it('supports runNow and reports unknown tasks', async () => {
    const clock = fakeClock()
    const scheduler = new Scheduler(clock.now)
    const run = vi.fn(async () => undefined)
    scheduler.register({ name: 'job', intervalMs: 60_000, run })

    expect((await scheduler.runNow('job')).ok).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(await scheduler.runNow('nope')).toEqual({ ok: false, error: 'Unknown task: nope' })
  })

  it('does not run a task twice concurrently', async () => {
    const clock = fakeClock()
    const scheduler = new Scheduler(clock.now)
    let active = 0
    let maxActive = 0
    scheduler.register({
      name: 'slow',
      intervalMs: 0,
      run: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      },
    })

    await Promise.all([scheduler.tick(), scheduler.tick()])
    expect(maxActive).toBe(1)
  })
})

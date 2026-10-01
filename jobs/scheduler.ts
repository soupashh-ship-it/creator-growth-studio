/**
 * Background scheduler (spec §82).
 *
 * Lightweight interval scheduler for periodic local work (refreshing connected
 * channels, pruning cache). `tick()` is deterministic and takes the clock from
 * the constructor, so it is unit-testable without real timers. A task that
 * throws never stops the loop — the error is recorded and surfaced to the UI.
 */
export interface ScheduledTask {
  name: string
  /** Minimum time between runs. */
  intervalMs: number
  run: (signal: AbortSignal) => Promise<void>
}

export interface TaskStatus {
  name: string
  intervalMs: number
  lastRunAt: string | null
  lastError: string | null
  running: boolean
}

interface InternalTask extends ScheduledTask {
  lastRunAt: number | null
  lastError: string | null
  running: boolean
}

export class Scheduler {
  private readonly tasks = new Map<string, InternalTask>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly now: () => number = Date.now,
    private readonly tickMs = 60_000,
  ) {}

  register(task: ScheduledTask): void {
    this.tasks.set(task.name, { ...task, lastRunAt: null, lastError: null, running: false })
  }

  unregister(name: string): void {
    this.tasks.delete(name)
  }

  /** §139: changes a task's interval at runtime; 0 pauses the task. */
  reschedule(name: string, intervalMs: number): void {
    const task = this.tasks.get(name)
    if (!task) return
    if (intervalMs <= 0) {
      this.tasks.delete(name)
      return
    }
    this.tasks.set(name, { ...task, intervalMs })
  }

  /** Runs every task whose interval has elapsed. Returns the names that ran. */
  async tick(): Promise<string[]> {
    const now = this.now()
    const ran: string[] = []

    for (const task of this.tasks.values()) {
      if (task.running) continue
      if (task.lastRunAt !== null && now - task.lastRunAt < task.intervalMs) continue

      task.running = true
      task.lastRunAt = now
      ran.push(task.name)
      try {
        await task.run(new AbortController().signal)
        task.lastError = null
      } catch (error) {
        task.lastError = error instanceof Error ? error.message : String(error)
      } finally {
        task.running = false
      }
    }

    return ran
  }

  /** Executes one task immediately, ignoring its interval. */
  async runNow(name: string): Promise<{ ok: boolean; error?: string }> {
    const task = this.tasks.get(name)
    if (!task) return { ok: false, error: `Unknown task: ${name}` }
    task.running = true
    task.lastRunAt = this.now()
    try {
      await task.run(new AbortController().signal)
      task.lastError = null
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      task.lastError = message
      return { ok: false, error: message }
    } finally {
      task.running = false
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, this.tickMs)
    // Never keep the process alive just for the scheduler.
    if (typeof this.timer === 'object' && this.timer !== null && 'unref' in this.timer) {
      this.timer.unref()
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  list(): TaskStatus[] {
    return [...this.tasks.values()].map((task) => ({
      name: task.name,
      intervalMs: task.intervalMs,
      lastRunAt: task.lastRunAt === null ? null : new Date(task.lastRunAt).toISOString(),
      lastError: task.lastError,
      running: task.running,
    }))
  }
}

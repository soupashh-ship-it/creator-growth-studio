/**
 * Job queue (spec §82). Long-running AI work is queued, observable, cancellable
 * and persisted (completed results are handed back so callers can store them).
 */
export type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Job<T = unknown> {
  id: string
  kind: string
  state: JobState
  queuedAt: string
  startedAt?: string
  finishedAt?: string
  result?: T
  error?: string
}

interface InternalJob<T> extends Job<T> {
  run: (signal: AbortSignal) => Promise<T>
  controller: AbortController
}

export interface EnqueueOptions {
  kind: string
  /** Progress callback so the UI can show which provider is being tried. */
  onStateChange?: (job: Job) => void
}

export class JobQueue {
  private readonly jobs = new Map<string, InternalJob<unknown>>()
  private running = 0
  private readonly pending: string[] = []

  constructor(private readonly concurrency = 1) {}

  enqueue<T>(kind: string, run: (signal: AbortSignal) => Promise<T>, onStateChange?: (job: Job) => void): Job<T> {
    const id = crypto.randomUUID()
    const job: InternalJob<T> = {
      id,
      kind,
      state: 'queued',
      queuedAt: new Date().toISOString(),
      run,
      controller: new AbortController(),
    }
    this.jobs.set(id, job as unknown as InternalJob<unknown>)
    this.pending.push(id)
    onStateChange?.(job)
    this.pump(onStateChange)
    return job
  }

  private pump(onStateChange?: (job: Job) => void): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()
      if (!id) return
      const job = this.jobs.get(id)
      if (!job || job.state === 'cancelled') continue
      void this.execute(job, onStateChange)
    }
  }

  private async execute(job: InternalJob<unknown>, onStateChange?: (job: Job) => void): Promise<void> {
    this.running += 1
    job.state = 'running'
    job.startedAt = new Date().toISOString()
    onStateChange?.(job)

    try {
      const result = await job.run(job.controller.signal)
      job.state = job.controller.signal.aborted ? 'cancelled' : 'completed'
      job.result = result
    } catch (error) {
      job.state = job.controller.signal.aborted ? 'cancelled' : 'failed'
      job.error = error instanceof Error ? error.message : String(error)
    } finally {
      job.finishedAt = new Date().toISOString()
      this.running -= 1
      onStateChange?.(job)
      this.pump(onStateChange)
    }
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job || job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled') {
      return false
    }
    job.controller.abort()
    if (job.state === 'queued') {
      job.state = 'cancelled'
      job.finishedAt = new Date().toISOString()
    }
    return true
  }

  get(id: string): Job | null {
    const job = this.jobs.get(id)
    if (!job) return null
    // Return only the public shape — never the runner or its AbortController.
    return {
      id: job.id,
      kind: job.kind,
      state: job.state,
      queuedAt: job.queuedAt,
      ...(job.startedAt !== undefined ? { startedAt: job.startedAt } : {}),
      ...(job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {}),
      ...(job.result !== undefined ? { result: job.result } : {}),
      ...(job.error !== undefined ? { error: job.error } : {}),
    }
  }

  list(): Job[] {
    return [...this.jobs.keys()].map((id) => this.get(id)).filter((j): j is Job => j !== null)
  }
}

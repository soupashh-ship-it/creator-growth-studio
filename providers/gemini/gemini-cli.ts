import { spawn } from 'node:child_process'
import {
  ProviderError,
  type AIProvider,
  type AuthResult,
  type GenerationRequest,
  type GenerationResult,
  type ModelInfo,
  type ProviderHealth,
  type StreamCallbacks,
} from '../types'

/**
 * Gemini provider via the official **Gemini CLI** (spec §4).
 *
 * We never handle Google credentials ourselves: the CLI owns the delegated
 * Google sign-in and its local credential cache. This adapter only invokes the
 * CLI in headless mode and parses its documented output formats
 * (docs/INTEGRATION_AUDIT.md §2).
 *
 * Output formats:
 *   --output-format json        → single object { response, stats, error? }
 *   --output-format stream-json → JSONL events: init|message|tool_use|tool_result|error|result
 * Exit codes: 0 success · 1 general/API · 42 input · 53 turn limit exceeded
 */
export class GeminiCliProvider implements AIProvider {
  readonly id = 'gemini' as const
  readonly displayName = 'Gemini (Google account via Gemini CLI)'

  constructor(private readonly bin: string = 'gemini') {}

  private async run(args: string[], input: string, timeoutMs: number, signal?: AbortSignal): Promise<{ stdout: string; code: number }> {
    return new Promise((resolve) => {
      // The prompt goes over stdin, never into argv, so arbitrary content
      // cannot be interpreted by a shell (spec §85).
      const child = spawn(this.bin, args, {
        shell: process.platform === 'win32',
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => child.kill(), timeoutMs)

      child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
      child.on('error', () => {
        clearTimeout(timer)
        resolve({ stdout: `${stdout}\n${stderr}`, code: -1 })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ stdout, code: code ?? 1 })
      })

      if (signal) {
        if (signal.aborted) child.kill()
        else signal.addEventListener('abort', () => child.kill(), { once: true })
      }

      child.stdin.write(input)
      child.stdin.end()
    })
  }

  private mapExitCode(code: number, provider: string): ProviderError | null {
    if (code === 0) return null
    if (code === 42) return new ProviderError('invalid_output', this.id, `${provider} rejected the input (exit 42).`)
    if (code === 53) return new ProviderError('rate_limited', this.id, `${provider} hit its turn limit (exit 53).`)
    if (code === -1) {
      return new ProviderError(
        'not_configured',
        this.id,
        'Gemini CLI was not found. Install it and sign in with Google, then Detect Again.',
      )
    }
    return new ProviderError('unavailable', this.id, `${provider} failed (exit ${code}).`)
  }

  async authenticate(): Promise<AuthResult> {
    return {
      ok: true,
      accountLabel: 'Google account (managed by Gemini CLI)',
    }
  }

  async disconnect(): Promise<void> {
    // Credentials belong to the CLI, not to us; we do not touch them.
  }

  async isAvailable(): Promise<boolean> {
    const { code } = await this.run(['--version'], '', 8000)
    return code === 0
  }

  async getModels(): Promise<ModelInfo[]> {
    // Model discovery is delegated to the CLI; we surface a capability-level
    // view rather than inventing model ids the CLI may not accept.
    return [
      {
        id: 'auto',
        displayName: 'Auto (chosen by Gemini CLI)',
        capabilities: {
          text: true,
          vision: true,
          reasoning: true,
          largeContext: true,
          structuredOutput: false,
          streaming: true,
        },
      },
    ]
  }

  async generateText(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
    const available = await this.isAvailable()
    if (!available) {
      throw new ProviderError(
        'not_configured',
        this.id,
        'Gemini CLI not installed. Install it and run "gemini" once to sign in with Google.',
      )
    }

    const prompt = request.system ? `${request.system}\n\n${request.input}` : request.input
    const args = ['--output-format', 'json']
    if (request.model && request.model !== 'auto') args.push('--model', request.model)

    const { stdout, code } = await this.run(args, prompt, 180_000, signal)
    const exitError = this.mapExitCode(code, 'Gemini CLI')
    if (exitError) throw exitError

    let parsed: { response?: string; stats?: Record<string, unknown>; error?: { message?: string } }
    try {
      parsed = JSON.parse(stdout) as typeof parsed
    } catch {
      throw new ProviderError('api_changed', this.id, 'Gemini CLI did not return the expected JSON object.', stdout.slice(0, 500))
    }

    if (parsed.error) {
      throw new ProviderError('unavailable', this.id, parsed.error.message ?? 'Gemini CLI reported an error.')
    }

    const text = parsed.response ?? ''
    if (!text) throw new ProviderError('invalid_output', this.id, 'Gemini CLI returned an empty response.')

    return { text, modelId: request.model ?? 'auto', providerId: this.id, finishReason: 'stop' }
  }

  async streamText(
    request: GenerationRequest,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const prompt = request.system ? `${request.system}\n\n${request.input}` : request.input
    const { stdout, code } = await this.run(['--output-format', 'stream-json'], prompt, 180_000, signal)

    const exitError = this.mapExitCode(code, 'Gemini CLI')
    if (exitError) {
      callbacks.onError(exitError)
      return
    }

    let text = ''
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event: { type?: string; message?: { content?: string }; response?: string; error?: { message?: string } }
      try {
        event = JSON.parse(trimmed) as typeof event
      } catch {
        continue
      }
      if (event.type === 'message' && event.message?.content) {
        text += event.message.content
        callbacks.onDelta(event.message.content)
      } else if (event.type === 'result' && event.response) {
        text = event.response
      } else if (event.type === 'error' && event.error?.message) {
        callbacks.onError(new ProviderError('unavailable', this.id, event.error.message))
        return
      }
    }

    callbacks.onDone({ text, modelId: request.model ?? 'auto', providerId: this.id, finishReason: 'stop' })
  }

  async healthCheck(): Promise<ProviderHealth> {
    const available = await this.isAvailable()
    return {
      available,
      authenticated: available,
      detail: available
        ? 'Gemini CLI detected. Sign-in is handled by the CLI.'
        : 'Gemini CLI not installed. Install it and sign in with Google.',
      checkedAt: new Date().toISOString(),
    }
  }
}

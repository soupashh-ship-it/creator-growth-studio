import { useState } from 'react'
import type { JSX } from 'react'

const STEPS: Array<{ title: string; body: string; bullets: string[] }> = [
  {
    title: 'Everything runs on this computer',
    body: 'Creator Growth Studio is local-first. SEO scoring, title comparison, keyword reasoning and the content calendar work with no account and no network.',
    bullets: [
      'Your analytics database is a single SQLite file on this machine.',
      'Credentials are kept in OS-encrypted storage, never in the database or logs.',
      'You can back up or restore all data from the Data page.',
    ],
  },
  {
    title: 'Only real data is shown',
    body: 'Missing data is labelled "Not available" rather than estimated. No bots, fake engagement or inflated metrics are ever used.',
    bullets: [
      'Scores are deterministic heuristics — not predictions of rankings or CTR.',
      'Search volume is never invented; demand is shown as a relative index.',
      'If a provider or platform is unavailable, the UI says so.',
    ],
  },
  {
    title: 'Connect what you want, when you want',
    body: 'Sign-in uses each platform’s official flow. Account-based AI sign-in is preferred over API keys.',
    bullets: [
      'YouTube uses Google’s loopback + PKCE OAuth flow.',
      'Twitch uses the Device Code grant, so no client secret is stored.',
      'Gemini can use your Google sign-in via the Gemini CLI; local models run via Ollama/LM Studio.',
    ],
  },
]

/**
 * First-run wizard (spec §74). Explains the honest-data and privacy model, then
 * hands off to the app. It never blocks the user from starting work.
 */
export function Welcome({ onDone }: { onDone: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const current = STEPS[step] as (typeof STEPS)[number]
  const last = step === STEPS.length - 1

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-8">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Step {step + 1} of {STEPS.length}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{current.title}</h1>
        <p className="mt-3 text-[14px] text-[var(--color-text-secondary)]">{current.body}</p>
        <ul className="mt-4 space-y-2 text-[13px] text-[var(--color-text-secondary)]">
          {current.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span className="text-[var(--color-accent)]">•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onDone}
            className="text-[12px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px]"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onDone() : setStep((s) => s + 1))}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10]"
            >
              {last ? 'Start using the app' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

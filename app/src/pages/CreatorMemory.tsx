import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { EmptyState } from '../components/EmptyState'
import { callIpc, useIpc } from '../useIpc'

interface Profile {
  niche: string | null
  topics: string[]
  language: string | null
  audience: string | null
  goals: string[]
  updatedAt: string | null
}

interface KnowledgeDoc {
  id: string
  title: string
  snippet: string
  createdAt: string
}

interface AskResult {
  answer: string
  matches: Array<{ id: string; title: string; snippet: string }>
  usedKnowledge: boolean
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Creator Memory (spec §56–57).
 *
 * The profile shapes AI recommendations (it is included in the Copilot
 * briefing). Knowledge documents are local text (brand guides, past scripts,
 * strategy notes) searchable with local FTS and usable for "Ask Creator
 * Knowledge". Nothing here leaves the machine except the composed prompt.
 */
export function CreatorMemory(): JSX.Element {
  const profile = useIpc<Profile | null>(IPC.profileGet)
  const knowledge = useIpc<KnowledgeDoc[]>(IPC.knowledgeList)

  const [form, setForm] = useState({
    niche: '',
    topicsText: '',
    language: '',
    audience: '',
    goalsText: '',
  })
  const [profileNote, setProfileNote] = useState<string | null>(null)

  const [docTitle, setDocTitle] = useState('')
  const [docBody, setDocBody] = useState('')
  const [docNote, setDocNote] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string; snippet: string }> | null>(null)

  // Semantic index (§142) — local embeddings, FTS fallback.
  const vectorStatus = useIpc<{
    available: boolean
    providerId: string | null
    totalChunks: number
    embeddedChunks: number
    detail: string
  }>(IPC.knowledgeVectorStatus)
  const [indexNote, setIndexNote] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)

  const [question, setQuestion] = useState('')
  const [askResult, setAskResult] = useState<AskResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function saveProfile(): Promise<void> {
    setActionError(null)
    try {
      await callIpc(IPC.profileSave, {
        niche: form.niche,
        topicsText: form.topicsText,
        language: form.language,
        audience: form.audience,
        goalsText: form.goalsText,
      })
      setProfileNote('Profile saved. It is included in the Copilot briefing.')
      profile.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not save the profile.')
    }
  }

  async function addDoc(): Promise<void> {
    setActionError(null)
    setDocNote(null)
    try {
      await callIpc(IPC.knowledgeAdd, { title: docTitle, body: docBody })
      setDocTitle('')
      setDocBody('')
      setDocNote('Added and indexed locally.')
      knowledge.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not add the document.')
    }
  }

  async function runSearch(): Promise<void> {
    if (!query.trim()) return
    try {
      const results = await callIpc<Array<{ id: string; title: string; snippet: string }>>(IPC.knowledgeSearch, { query })
      setSearchResults(results)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Search failed.')
    }
  }

  async function buildIndex(): Promise<void> {
    setIndexNote(null)
    setIndexing(true)
    try {
      const result = await callIpc<{ embedded: number; providerId: string; modelId: string }>(
        IPC.knowledgeIndexEmbeddings,
      )
      setIndexNote(
        result.embedded === 0
          ? 'Everything is already embedded.'
          : `Embedded ${result.embedded} chunk(s) locally with ${result.providerId}.`,
      )
      vectorStatus.reload()
    } catch (cause) {
      setIndexNote(cause instanceof Error ? cause.message : 'Could not build the semantic index.')
    } finally {
      setIndexing(false)
    }
  }

  async function ask(): Promise<void> {
    if (!question.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<AskResult>(IPC.knowledgeAsk, { question })
      setAskResult(result)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The answer failed — is an AI provider connected?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Creator Memory</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Your profile and knowledge base, stored locally. The profile steers AI recommendations; the
          knowledge base is searchable and answerable ("Ask Creator Knowledge").
        </p>
      </header>

      {actionError && <p className="text-[12px] text-[var(--color-danger)]">{actionError}</p>}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Creator profile</h2>
        {profile.data && (
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Last saved {profile.data.updatedAt ? new Date(profile.data.updatedAt).toLocaleString() : 'never'}
          </p>
        )}
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="pf-niche">Niche</label>
            <input id="pf-niche" className={`${input} mt-1`} value={form.niche} onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))} placeholder="Path of Exile builds & PC optimization" />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="pf-lang">Language</label>
            <input id="pf-lang" className={`${input} mt-1`} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} placeholder="English" />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="pf-topics">Topics (comma-separated)</label>
            <input id="pf-topics" className={`${input} mt-1`} value={form.topicsText} onChange={(e) => setForm((f) => ({ ...f, topicsText: e.target.value }))} placeholder="poe 2, pc hardware, guides" />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="pf-audience">Audience</label>
            <input id="pf-audience" className={`${input} mt-1`} value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))} placeholder="intermediate players" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="pf-goals">Goals (comma-separated)</label>
            <input id="pf-goals" className={`${input} mt-1`} value={form.goalsText} onChange={(e) => setForm((f) => ({ ...f, goalsText: e.target.value }))} placeholder="grow subscribers, more search traffic" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => void saveProfile()} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10]">
            Save profile
          </button>
          {profileNote && <span className="text-[12px] text-[var(--color-positive)]">{profileNote}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Knowledge base</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          Paste brand guides, past scripts, strategy notes or sponsor requirements. Stored locally and
          searchable — never uploaded anywhere.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <input className={input} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Title (e.g. Channel strategy 2026)" aria-label="Document title" />
          <textarea className={`${input} min-h-24 resize-y`} value={docBody} onChange={(e) => setDocBody(e.target.value)} placeholder="Paste the document text…" aria-label="Document text" />
        </div>
        <button type="button" onClick={() => void addDoc()} disabled={!docBody.trim()} className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40">
          Add document
        </button>
        {docNote && <span className="ml-3 text-[12px] text-[var(--color-positive)]">{docNote}</span>}

        <div className="mt-4 rounded-md bg-[var(--color-surface-2)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Search mode
            </div>
            <button
              type="button"
              onClick={() => void buildIndex()}
              disabled={indexing || !vectorStatus.data?.available}
              className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1 text-[11px] disabled:opacity-40"
            >
              {indexing ? 'Embedding…' : 'Build semantic index'}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
            {vectorStatus.data?.detail ?? 'Checking local embedding availability…'}
          </p>
          {indexNote && <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{indexNote}</p>}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your documents…"
            aria-label="Search knowledge"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
            }}
          />
          <button type="button" onClick={() => void runSearch()} disabled={!query.trim()} className="shrink-0 rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40">
            Search
          </button>
        </div>
        {searchResults && (
          searchResults.length === 0 ? (
            <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">No documents matched.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {searchResults.map((hit) => (
                <li key={hit.id} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                  <div className="font-medium">{hit.title}</div>
                  <div className="mt-0.5 text-[var(--color-text-secondary)]">{hit.snippet}</div>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="mt-4 flex gap-2">
          <input
            className={input}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your knowledge base…"
            aria-label="Ask knowledge"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask()
            }}
          />
          <button type="button" onClick={() => void ask()} disabled={busy || !question.trim()} className="shrink-0 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40">
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {askResult && (
          <div className="mt-3 rounded-md bg-[var(--color-surface-2)] p-3">
            <pre className="whitespace-pre-wrap text-[13px]">{askResult.answer}</pre>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              {askResult.usedKnowledge ? `Grounded in ${askResult.matches.length} document excerpt(s).` : 'No documents matched — the answer says what to add.'}
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Saved documents ({knowledge.data?.length ?? 0})</h2>
          <button type="button" onClick={knowledge.reload} className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline">
            ↻ Refresh
          </button>
        </div>
        {knowledge.data && knowledge.data.length === 0 && (
          <EmptyState title="No documents yet" body="Add your brand guide, strategy notes or best past scripts — they make every AI answer more specific to you." />
        )}
        <ul className="mt-2 space-y-2">
          {(knowledge.data ?? []).map((doc) => (
            <li key={doc.id} className="flex items-start justify-between gap-3 rounded-md bg-[var(--color-surface-2)] p-3">
              <div>
                <div className="text-[13px] font-medium">{doc.title}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">
                  added {new Date(doc.createdAt).toLocaleDateString()} · {doc.snippet.slice(0, 80)}…
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void callIpc(IPC.knowledgeDelete, { id: doc.id }).then(() => knowledge.reload())
                }}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                aria-label={`Delete ${doc.title}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

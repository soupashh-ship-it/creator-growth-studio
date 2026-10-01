/**
 * Video brief helper (spec §30).
 *
 * Deterministic completeness review of a brief the creator writes (or an AI
 * draft they edit). The app checks what a production-ready brief should answer
 * and lists what is still missing — it never fabricates brief content itself.
 */
export interface BriefSection {
  key: string
  label: string
  text: string
  why: string
}

export interface BriefCompleteness {
  sections: BriefSection[]
  filled: number
  total: number
  missing: string[]
  notes: string[]
}

const SECTION_DEFS: Array<{ key: string; label: string; why: string }> = [
  { key: 'promise', label: 'Viewer promise', why: 'What the viewer gets — the one sentence the video must pay off.' },
  { key: 'audience', label: 'Audience & stakes', why: 'Who this is for and why they should care.' },
  { key: 'angle', label: 'Angle vs existing videos', why: 'What this does differently from what is already out there.' },
  { key: 'proof', label: 'Proof / credibility plan', why: 'Real evidence you will show (tests, sources, demos) — no invented proof.' },
  { key: 'structure', label: 'Beat outline', why: 'Major beats from hook to payoff.' },
  { key: 'packaging', label: 'Packaging notes', why: 'Title keyword, thumbnail concept, and the honest tension between them.' },
]

export function assessBriefCompleteness(sections: Partial<Record<string, string>>): BriefCompleteness {
  const filled = SECTION_DEFS.filter((def) => (sections[def.key] ?? '').trim().length > 0)
  const missing = SECTION_DEFS.filter((def) => (sections[def.key] ?? '').trim().length === 0).map((def) => def.label)

  const notes: string[] = []
  if ((sections['proof'] ?? '').trim().length === 0) {
    notes.push('No proof plan yet: anything the video claims must be backed by real tests or sources you actually have.')
  }
  if ((sections['packaging'] ?? '').trim().length > 0 && (sections['promise'] ?? '').trim().length === 0) {
    notes.push('Packaging is drafted before the promise — make sure the title/thumbnail promise matches what the video delivers.')
  }

  return {
    sections: SECTION_DEFS.map((def) => ({
      ...def,
      text: sections[def.key] ?? '',
    })),
    filled: filled.length,
    total: SECTION_DEFS.length,
    missing,
    notes,
  }
}

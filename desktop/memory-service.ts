import { getServices } from './services'

/**
 * Creator memory & knowledge base service (spec §56–57, §121–122).
 *
 * All local. Knowledge docs are plain text the creator pastes or imports; they
 * are indexed into FTS (search_transcripts) for "Ask Creator Knowledge". No
 * embeddings yet — FTS is honest and offline (§142 stays optional).
 */
export interface CreatorProfileView {
  niche: string | null
  topics: string[]
  language: string | null
  audience: string | null
  goals: string[]
  updatedAt: string | null
}

export function getProfile(workspaceId: string): CreatorProfileView | null {
  const profile = getServices().repos.getCreatorProfile(workspaceId)
  if (!profile) return null
  return {
    niche: profile.niche,
    topics: profile.topics,
    language: profile.language,
    audience: profile.audience,
    goals: profile.goals,
    updatedAt: profile.updated_at,
  }
}

export function saveProfile(
  workspaceId: string,
  input: { niche?: string; topicsText?: string; language?: string; audience?: string; goalsText?: string },
): CreatorProfileView {
  const { repos } = getServices()
  repos.upsertCreatorProfile({
    workspaceId,
    ...(input.niche !== undefined ? { niche: input.niche } : {}),
    ...(input.topicsText !== undefined ? { topics: input.topicsText.split(',').map((t) => t.trim()).filter(Boolean) } : {}),
    ...(input.language !== undefined ? { language: input.language } : {}),
    ...(input.audience !== undefined ? { audience: input.audience } : {}),
    ...(input.goalsText !== undefined ? { goals: input.goalsText.split(',').map((t) => t.trim()).filter(Boolean) } : {}),
  })
  const view = getProfile(workspaceId)
  if (!view) throw new Error('Profile save failed.')
  return view
}

export function listKnowledge(workspaceId: string): Array<{ id: string; title: string; snippet: string; createdAt: string }> {
  const { repos } = getServices()
  return repos.listKnowledgeDocs(workspaceId).map((doc) => {
    const body = repos.getKnowledgeDocBody(doc.id) ?? ''
    return {
      id: doc.id,
      title: doc.title ?? '(untitled)',
      snippet: body.slice(0, 160),
      createdAt: doc.created_at,
    }
  })
}

export function addKnowledge(workspaceId: string, input: { title: string; body: string }): { id: string } {
  const title = input.title.trim() || `Note ${new Date().toISOString().slice(0, 10)}`
  const body = input.body.trim()
  if (!body) throw new Error('The document body is empty.')
  return { id: getServices().repos.createKnowledgeDoc({ workspaceId, title, body }) }
}

export function deleteKnowledge(id: string): void {
  getServices().repos.deleteKnowledgeDoc(id)
}

/** FTS search across knowledge docs, scoped to the workspace. */
export function searchKnowledge(workspaceId: string, query: string): Array<{ id: string; title: string; snippet: string }> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return getServices().repos.searchKnowledge(workspaceId, trimmed)
}

/** Ask: retrieves matching knowledge and returns the briefing-style context. */
export async function askKnowledge(
  workspaceId: string,
  question: string,
  generate: (system: string, input: string) => Promise<string>,
): Promise<{ answer: string; matches: Array<{ id: string; title: string; snippet: string }>; usedKnowledge: boolean }> {
  const matches = searchKnowledge(workspaceId, question)
  const profile = getProfile(workspaceId)
  const snippets = matches.map((m) => `${m.title}: ${m.snippet}`)

  const profileLines = profile
    ? `Creator profile — niche: ${profile.niche ?? 'not set'}; topics: ${profile.topics.join(', ') || 'not set'}; audience: ${profile.audience ?? 'not set'}.`
    : 'No creator profile saved yet.'

  const system =
    'You answer questions about the creator using ONLY the supplied knowledge excerpts and profile. ' +
    'If the answer is not contained there, say exactly that and suggest what document to add. ' +
    'Never invent facts, metrics, or past events.'
  const input = [
    profileLines,
    snippets.length > 0 ? `KNOWLEDGE EXCERPTS:\n${snippets.join('\n---\n')}` : 'No knowledge documents matched this question.',
    `QUESTION: ${question}`,
  ].join('\n\n')

  const answer = await generate(system, input)
  return { answer, matches, usedKnowledge: snippets.length > 0 }
}

// -- search history & favorites (§121, §122) ---------------------------------

export function getHistory(workspaceId: string): Array<{ id: string; query: string; scope: string | null; createdAt: string }> {
  return getServices()
    .repos.listSearchHistory(workspaceId)
    .map((row) => ({ id: row.id, query: row.query, scope: row.scope, createdAt: row.created_at }))
}

export function recordSearch(workspaceId: string, query: string, scope: string): void {
  getServices().repos.addSearchHistory(workspaceId, query, scope)
}

export function clearHistory(workspaceId: string): number {
  return getServices().repos.clearSearchHistory(workspaceId)
}

export function listFavorites(workspaceId: string): Array<{ entityType: string; entityId: string; createdAt: string }> {
  return getServices()
    .repos.listFavorites(workspaceId)
    .map((row) => ({ entityType: row.entity_type, entityId: row.entity_id, createdAt: row.created_at }))
}

export function toggleFavorite(workspaceId: string, entityType: string, entityId: string): { active: boolean } {
  const { repos } = getServices()
  const existing = repos.listFavorites(workspaceId, entityType).find((f) => f.entity_id === entityId)
  if (existing) {
    repos.removeFavorite(workspaceId, entityType, entityId)
    return { active: false }
  }
  repos.addFavorite({ workspaceId, entityType, entityId, label: '' })
  return { active: true }
}

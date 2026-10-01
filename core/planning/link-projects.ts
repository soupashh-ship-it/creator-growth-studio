/**
 * Project ↔ published-video linking (spec §124).
 *
 * Projects and published videos are matched by TITLE only, using a transparent
 * token-overlap heuristic — never analytics, never a prediction. The matcher
 * proposes candidates; the creator confirms. Confident matches can be applied
 * in one action, and every candidate shows the score and why it matched.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'my', 'your', 'how', 'is', 'it', 'this', 'that', 'vs', 'feat', 'ft',
  'official', 'video', 'full', 'new', 'best', 'ep', 'episode', 'part',
])

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function titleTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

/**
 * 0–1 similarity between two titles. Combines Jaccard overlap, containment of
 * the shorter title's tokens and a substring bonus, so "My Best Build" and
 * "My Best Build — Full Guide" score highly without treating unrelated titles
 * as a match.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const setA = new Set(titleTokens(a))
  const setB = new Set(titleTokens(b))
  const substring = na.includes(nb) || nb.includes(na) ? 0.9 : 0
  if (setA.size === 0 || setB.size === 0) return substring

  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection += 1
  const union = setA.size + setB.size - intersection
  const jaccard = union === 0 ? 0 : intersection / union

  const shorter = setA.size <= setB.size ? setA : setB
  let contained = 0
  for (const token of shorter) if (setA.has(token) && setB.has(token)) contained += 1
  const containment = shorter.size === 0 ? 0 : contained / shorter.size

  return Math.round(Math.max(jaccard, containment, substring) * 100) / 100
}

export interface ProjectLike {
  id: string
  title: string
  stage?: string
}

export interface VideoLike {
  id: string
  title: string | null
  project_id?: string | null
}

export interface LinkCandidate {
  projectId: string
  projectTitle: string
  videoId: string
  videoTitle: string
  /** 0–1 title similarity. */
  score: number
  /** True when the match is strong enough to apply without review. */
  confident: boolean
  reason: string
}

export interface LinkOptions {
  /** Minimum score to surface a candidate. */
  minScore?: number
  /** Score at or above which a match is "confident". */
  confidentAt?: number
}

export const MIN_SUGGEST_SCORE = 0.45
export const CONFIDENT_SCORE = 0.7

/**
 * Proposes one-to-one project↔video links. Only unlinked videos are considered,
 * and each project/video appears at most once — the strongest match wins.
 */
export function suggestProjectLinks(
  projects: ProjectLike[],
  videos: VideoLike[],
  options: LinkOptions = {},
): LinkCandidate[] {
  const minScore = options.minScore ?? MIN_SUGGEST_SCORE
  const confidentAt = options.confidentAt ?? CONFIDENT_SCORE
  const pool = videos.filter((video) => video.title && !video.project_id)

  const scored: LinkCandidate[] = []
  for (const project of projects) {
    for (const video of pool) {
      const videoTitle = video.title as string
      const score = titleSimilarity(project.title, videoTitle)
      if (score < minScore) continue
      const shared = titleTokens(project.title).filter((token) =>
        titleTokens(videoTitle).includes(token),
      )
      scored.push({
        projectId: project.id,
        projectTitle: project.title,
        videoId: video.id,
        videoTitle,
        score,
        confident: score >= confidentAt,
        reason:
          shared.length > 0
            ? `${Math.round(score * 100)}% title overlap across ${shared.length} shared keyword(s): ${shared.slice(0, 4).join(', ')}`
            : `${Math.round(score * 100)}% title similarity`,
      })
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.projectTitle.localeCompare(b.projectTitle) ||
      a.videoTitle.localeCompare(b.videoTitle),
  )

  const usedProjects = new Set<string>()
  const usedVideos = new Set<string>()
  const result: LinkCandidate[] = []
  for (const candidate of scored) {
    if (usedProjects.has(candidate.projectId) || usedVideos.has(candidate.videoId)) continue
    usedProjects.add(candidate.projectId)
    usedVideos.add(candidate.videoId)
    result.push(candidate)
  }
  return result
}

export const LINKING_NOTES = [
  'Matching uses title keywords only — it never uses analytics and never guesses beyond the titles you already have.',
  'Confident matches can be applied in one action; everything else stays a suggestion you confirm by hand.',
  'A video already linked to a project is left alone, and each project is offered a single best match.',
]

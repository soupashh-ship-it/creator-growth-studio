/**
 * Content gap analyzer (spec §26). Compares topics competitors cover against
 * topics the creator covers, using only public data (spec §27).
 */
export interface TopicCount {
  topic: string
  count: number
}

export interface ContentGap {
  topic: string
  competitorCount: number
  userCount: number
  /** 0–100: how large the missed opportunity appears. */
  gapScore: number
  reason: string
}

export function findContentGaps(
  userTopics: TopicCount[],
  competitorTopics: TopicCount[],
  options: { minCompetitorCount?: number } = {},
): ContentGap[] {
  const minCompetitorCount = options.minCompetitorCount ?? 2
  const userByTopic = new Map(userTopics.map((t) => [t.topic.toLowerCase(), t.count]))

  const maxCompetitor = Math.max(1, ...competitorTopics.map((t) => t.count))

  return competitorTopics
    .filter((t) => t.count >= minCompetitorCount)
    .map((competitor) => {
      const userCount = userByTopic.get(competitor.topic.toLowerCase()) ?? 0
      const competitorShare = competitor.count / maxCompetitor
      const userShare = userTopics.length === 0 ? 0 : (userCount || 0) / Math.max(1, ...userTopics.map((t) => t.count))
      const gapScore = Math.round(Math.max(0, Math.min(100, (competitorShare - userShare) * 100)))
      return {
        topic: competitor.topic,
        competitorCount: competitor.count,
        userCount,
        gapScore,
        reason:
          userCount === 0
            ? `Competitors published this ${competitor.count}× but your channel has not covered it.`
            : `Competitors published this ${competitor.count}× vs your ${userCount}× — you may be under-serving it.`,
      }
    })
    .filter((gap) => gap.gapScore > 0)
    .sort((a, b) => b.gapScore - a.gapScore)
}

/**
 * Content series detection (spec §115): a successful recurring format that can
 * be applied to other subjects.
 */
export function detectSeries(
  titles: string[],
  options: { minOccurrences?: number } = {},
): Array<{ format: string; examples: string[] }> {
  const minOccurrences = options.minOccurrences ?? 3
  const phraseCounts = new Map<string, string[]>()

  for (const title of titles) {
    const words = title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    for (let size = 1; size <= Math.min(3, words.length); size += 1) {
      for (let i = 0; i + size <= words.length; i += 1) {
        const phrase = words.slice(i, i + size).join(' ')
        if (phrase.length < 6) continue
        const bucket = phraseCounts.get(phrase) ?? []
        bucket.push(title)
        phraseCounts.set(phrase, bucket)
      }
    }
  }

  return [...phraseCounts.entries()]
    .filter(([, examples]) => examples.length >= minOccurrences)
    .map(([format, examples]) => ({ format, examples }))
    // Prefer the most specific phrase when counts tie.
    .sort((a, b) => b.examples.length - a.examples.length || b.format.length - a.format.length)
    .filter((candidate, index, all) => !all.slice(0, index).some((other) => other.format.includes(candidate.format)))
}

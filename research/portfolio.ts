import type { VideoRow } from '../database/repositories'

/**
 * Content portfolio classification (spec §116–117).
 *
 * Classifies the creator's uploads into lifecycle categories using title text
 * and their own stored cadence — this is a local, explainable heuristic, not a
 * platform metric. Portfolio shares are counted per video (one video, one vote)
 * so a single outlier cannot dominate.
 */
export type ContentLifecycle = 'evergreen' | 'trend' | 'news' | 'seasonal' | 'format'

const EVERGREEN = /\b(best|guide|tutorial|how to|build|settings|explained|beginner|basics|ultimate|complete)\b/i
const TREND = /\b(patch \d|v?\d+\.\d+|new (update|league|season|event)|patch notes|0\.\d)\b/i
const NEWS = /\b(news|announced|revealed|breaking|just dropped|leaked|reaction)\b/i
const SEASONAL = /\b(christmas|halloween|summer|winter|anniversary|sale|lunar new year|black friday)\b/i
const FORMATS = /\b(part \d+|day \d+|episode|ep\.?\s*\d+|#\d+|season \d+)\b/i

export function classifyContent(title: string): ContentLifecycle {
  const t = title ?? ''
  if (SEASONAL.test(t)) return 'seasonal'
  if (NEWS.test(t)) return 'news'
  if (TREND.test(t)) return 'trend'
  if (FORMATS.test(t)) return 'format'
  if (EVERGREEN.test(t)) return 'evergreen'
  return 'evergreen'
}

export interface PortfolioSlice {
  category: ContentLifecycle
  count: number
  /** Percent of classified videos, 0–100 rounded to one decimal. */
  sharePct: number
  examples: string[]
}

export interface PortfolioBalance {
  slices: PortfolioSlice[]
  notes: string[]
}

export function buildPortfolioBalance(videos: VideoRow[]): PortfolioBalance {
  const counts = new Map<ContentLifecycle, string[]>()
  for (const video of videos) {
    const title = video.title ?? ''
    if (!title.trim()) continue
    const category = classifyContent(title)
    const list = counts.get(category) ?? []
    list.push(title)
    counts.set(category, list)
  }

  const total = [...counts.values()].reduce((sum, list) => sum + list.length, 0)
  const order: ContentLifecycle[] = ['evergreen', 'trend', 'news', 'seasonal', 'format']
  const slices: PortfolioSlice[] = order
    .filter((category) => counts.has(category))
    .map((category) => {
      const list = counts.get(category) ?? []
      return {
        category,
        count: list.length,
        sharePct: total === 0 ? 0 : Math.round((list.length / total) * 1000) / 10,
        examples: list.slice(0, 3),
      }
    })

  const evergreen = slices.find((s) => s.category === 'evergreen')?.sharePct ?? 0
  const trendish = (slices.find((s) => s.category === 'trend')?.sharePct ?? 0) + (slices.find((s) => s.category === 'news')?.sharePct ?? 0)
  const notes: string[] = [
    'Categories come from title patterns in your own uploads — classification is a heuristic, not a platform label.',
  ]
  if (total === 0) {
    notes.unshift('No titled videos stored yet — sync a channel to see your portfolio balance.')
  } else if (trendish > 70) {
    notes.push('Most of your recent uploads look trend/news-driven. Evergreen guides keep working between patches — worth balancing if it matches your goals.')
  } else if (evergreen > 85) {
    notes.push('Your library is almost entirely evergreen. Timely videos (patch reactions, news) are how most channels capture search spikes.')
  }

  return { slices, notes }
}

/**
 * Search-intent classifier (spec §22). Deterministic and explainable — the
 * returned `reasons` list why each intent was chosen, so the UI can show its
 * reasoning instead of an opaque label.
 */
export type SearchIntent =
  | 'tutorial'
  | 'comparison'
  | 'review'
  | 'entertainment'
  | 'news'
  | 'transactional'
  | 'troubleshooting'
  | 'build-guide'
  | 'beginner'
  | 'advanced'

export interface IntentResult {
  intent: SearchIntent
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
  scores: Record<SearchIntent, number>
}

const SIGNALS: Array<{ intent: SearchIntent; patterns: RegExp[]; reason: string }> = [
  { intent: 'tutorial', patterns: [/\bhow to\b/, /\btutorial\b/, /\bguide\b/, /\bstep by step\b/, /\blearn\b/], reason: 'contains instructional phrasing (how to / guide / tutorial)' },
  { intent: 'comparison', patterns: [/\bvs\b/, /\bversus\b/, /\bcompared?\b/, /\bdifference between\b/, /\bbetter than\b/], reason: 'compares two or more options' },
  { intent: 'review', patterns: [/\breview\b/, /\bworth it\b/, /\bhands on\b/, /\bimpressions?\b/, /\bshould you buy\b/], reason: 'evaluates a product or experience' },
  { intent: 'news', patterns: [/\bnews\b/, /\bpatch\b/, /\bupdate\b/, /\brelease\b/, /\bannounced\b/, /\bjust dropped\b/], reason: 'time-sensitive announcement/new information' },
  { intent: 'transactional', patterns: [/\bbuy\b/, /\bdownload\b/, /\bprice\b/, /\bcheap\b/, /\bdiscount\b/, /\bcoupon\b/], reason: 'intent to acquire something' },
  { intent: 'troubleshooting', patterns: [/\bfix\b/, /\berror\b/, /\bcrash\b/, /\bnot working\b/, /\bsolved?\b/, /\bproblem\b/], reason: 'problem-solving phrasing (fix / error / not working)' },
  { intent: 'build-guide', patterns: [/\bbuild\b/, /\bloadout\b/, /\bsetup\b/, /\bgear\b/, /\brotation\b/, /\bbis\b/], reason: 'describes a build/loadout/setup' },
  { intent: 'beginner', patterns: [/\bbeginner\b/, /\bstart(er|ing)?\b/, /\bnew player\b/, /\bbasics\b/, /\bfirst time\b/], reason: 'aimed at newcomers' },
  { intent: 'advanced', patterns: [/\badvanced\b/, /\bendgame\b/, /\bmin-?max\b/, /\boptimiz/, /\bmaster\b/, /\bdeep dive\b/], reason: 'aimed at experienced viewers' },
  { intent: 'entertainment', patterns: [/\binsane\b/, /\bfunny\b/, /\bmontage\b/, /\bchallenge\b/, /\breaction\b/, /\btrolling\b/], reason: 'entertainment-led phrasing' },
]

export function classifyIntent(text: string): IntentResult {
  const haystack = text.toLowerCase()
  const scores = {} as Record<SearchIntent, number>
  const reasons: string[] = []

  let best: SearchIntent = 'entertainment'
  let bestScore = 0

  for (const signal of SIGNALS) {
    let hits = 0
    for (const pattern of signal.patterns) {
      if (pattern.test(haystack)) hits += 1
    }
    scores[signal.intent] = hits
    if (hits > 0) reasons.push(`${signal.intent}: ${signal.reason}`)
    if (hits > bestScore) {
      bestScore = hits
      best = signal.intent
    }
  }

  if (bestScore === 0) {
    return {
      intent: 'entertainment',
      confidence: 'low',
      reasons: ['No strong intent signal found; defaulted to entertainment.'],
      scores,
    }
  }

  const confidence = bestScore >= 2 ? 'high' : 'medium'
  return { intent: best, confidence, reasons, scores }
}

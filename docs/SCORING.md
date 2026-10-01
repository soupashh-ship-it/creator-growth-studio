# Scoring Model

Every application-defined score, its inputs, weights, normalization,
missing-value behaviour, confidence, and limitations. No score is random and no
score is presented as an official platform metric (spec §11, §62–66, §96).

Conventions:

- All scores are integers **0–100** unless noted.
- Weights are **configurable** and stored with each calculation so an old report
  can be explained later (§62, §136).
- Every input carries a provenance kind: `official`, `derived`, `ai_estimate`,
  or `unavailable`.
- **Missing inputs are excluded and weights are renormalized** over the present
  inputs. The report stores `coverage = presentWeight / totalWeight` and the
  score is marked `low-confidence` when `coverage < 0.6`.
- These are **heuristic** scores. They estimate opportunity/quality; they do not
  predict rankings, views, or CTR. UI text must never promise outcomes.

Sub-scores use `clamp(x, 0, 100)` and `lin(x, lo, hi) = clamp((x-lo)/(hi-lo)*100, 0, 100)`.

---

## 1. Channel Health Score (`core/scores/channel-health`)

A composite of five pillars, each 0–100, averaged with fixed weights.

| Pillar | Weight | Inputs (all `official` unless noted) | Normalization |
|---|---|---|---|
| Discovery | 25% | impressions trend, browse/suggested/search traffic share, CTR | CTR `lin(1%,8%)`; traffic diversity = 100 × (1 − maxShare); trend = % change vs previous equal period mapped `lin(-30%,+30%)` |
| Retention | 25% | average view percentage, average view duration vs median | `avgViewPct lin(20%,60%)`; duration ratio `lin(0.6,1.4)` |
| Engagement | 20% | likes/views, comments/views, shares/views | rates normalized against configurable niche baselines |
| Consistency | 15% | upload cadence regularity | 100 × (1 − coefficientOfVariation(inter-upload days)) |
| Conversion | 15% | subscribers gained / views, returning-viewer share | `lin(0.2%,2%)`, returning share `lin(10%,45%)` |

**Why this score?** UI lists each pillar's raw inputs, the normalization used,
the computed sub-score, and the weight. Never labelled an official metric.

**Missing:** a pillar without inputs is dropped and weights renormalized;
coverage shown. If YouTube Analytics is not connected, the widget shows
"Connect YouTube to view analytics" rather than a number.

**Limitations:** baselines are approximate; retention inputs have reporting
latency; not comparable across unrelated niches.

---

## 2. Video SEO Score (`seo/analyzer`)

| Component | Weight | Basis |
|---|---|---|
| Title relevance | 20% | primary term presence/position, length, clarity |
| Search intent match | 15% | classified intent vs declared video type |
| Semantic coverage | 15% | coverage of expected subtopics (embedding/keyword set, local) |
| Description quality | 10% | length, primary term usage, links/chapters, first 150 chars |
| Keyword placement | 10% | primary/secondary terms in title, description, tags |
| Topic opportunity | 15% | from Trend/Opportunity engines (§4) — 0 if no signal |
| Metadata completeness | 5% | category, tags, language, captions |
| Title clarity | 10% | readability, no clickbait-only phrasing, no ALL-CAPS spam |

Sub-scores are deterministic string/semantic checks; the AI layer may add
*qualitative* strengths/issues but **cannot override the numeric components**
unless the user runs "AI re-score", which is separately labelled `ai_estimate`.

**Improvements list:** each recommendation carries an estimated `+delta` computed
by re-running the deterministic analyzer with the suggestion applied — it is an
internal comparison, not a ranking promise. UI text: "Predicted optimized
score".

**Missing:** topic-opportunity component is excluded when no trend/keyword signal
exists; coverage reported.

**Limitations:** semantic coverage depends on the local keyword set; language
support is best-effort outside the supported set.

---

## 3. Content Opportunity Score (`research/opportunity`)

| Factor | Weight | Source |
|---|---|---|
| Demand | 25% | relative demand from keyword/trend signals (never absolute volume) |
| Competition | 20% | estimated competition (inverted: less competition → higher) |
| Channel fit | 20% | overlap with `creator_profile` topics + historical topic performance |
| Freshness | 15% | recency of the driving signal (patch/news/trend age) |
| Historical fit | 10% | similar past videos' performance vs channel median |
| Audience interest | 10% | comment/community signals where available |

**Demand labelling:** because no legitimate absolute search-volume source exists
for arbitrary terms, demand is shown as `Relative demand: Low/Medium/High` plus a
0–100 `Trend index`. The app must **never** display "Search volume: N" unless a
real source provided it (§64). Each metric's provenance tooltip names the source.

**Missing:** factors without data are dropped + renormalized; coverage shown;
score labelled `low-confidence` below 0.6.

**Limitations:** freshness decays per topic type (patch-sensitive faster than
evergreen, §111–112, §116).

---

## 4. Thumbnail Score (`core/scores/thumbnail`, local image analysis)

Computed locally from the actual pixels of the chosen image (no cloud upload,
§16). Decoding uses Electron's `nativeImage`; `core/thumbnail/pixels.ts` turns the
raw bitmap into features and `core/scores/thumbnail.ts` scores them. Both are pure
and unit-tested with synthetic buffers.

| Component | Weight | Method (local CV) |
|---|---|---|
| Focal point / subject separation | 20% | saliency/edge-density + subject/background contrast |
| Contrast | 15% | luminance histogram spread, WCAG-ish contrast of key regions |
| Clutter | 15% | edge/entropy density; fewer competing regions scores higher |
| Visual hierarchy | 15% | size/position dominance of the primary region |
| Text readability | 15% | OCR text height as % of image; stroke/background contrast |
| Mobile readability | 10% | text legibility at ~120px wide (simulated) |
| Color separation | 10% | palette distinctness, no merged subject/background hues |

Output also flags object size and composition, and the relationship to the title
(**pair analyzer**, §17): when the thumbnail text substantially duplicates the
title, an issue is raised with complementary-text suggestions.

### What the pixel analyzer actually measures (`core/thumbnail/pixels.ts`)

All indices are **derived** from the sampled pixels, not estimated:

- `brightness` — mean luminance (0–255).
- `saturation` — mean chroma (0–100).
- `contrast` — standard deviation of luminance, mapped from 0–70 to 0–100.
- `edgeDensity` — mean absolute luminance gradient (0–100).
- `uniqueColorCount` — distinct 4-bit-per-channel colours sampled.
- `dominantColor` — most common colour in the centre region.
- `colorSeparation` — shortest hue distance between the centre and border
dominant colours; near-neutral pairs are discounted.
- `focalPointStrength` — 55% centre/border luminance difference + 45% colour
separation.
- `hierarchy` — share of the centre region occupied by its dominant colour.
- `objectSizeRatio` — fraction of pixels not matching the border's dominant
colour.

The bitmap is strided to at most ~20,000 samples, so analysis is O(1)-ish and
runs on the UI thread's IPC handler without a worker.

**Missing / not bundled (never fabricated):** face detection and OCR are absent,
so `faceVisible` is always `false` and `textHeightPct`, `textContrast` and
`mobileLegibility` are always `null`. The scorer drops those components and
renormalizes, and the UI labels them "Not available".
**Limitations:** heuristic CV, not a prediction of CTR.

---

## 5. Stream Discovery Score (`platforms/twitch`)

Helps choose a category; explicitly **not** a Twitch metric (§41).

| Factor | Weight | Source |
|---|---|---|
| Audience size | 20% | live viewers in category (Helix) |
| Competition | 20% | live channels (inverted) |
| Viewer/channel ratio | 25% | viewers ÷ channels (higher = better discoverability) |
| Creator history | 15% | creator's past performance in/near the category |
| Channel size fit | 10% | ratio vs creator's typical concurrents |
| Trend | 10% | change in viewers/channels over the session window |

Shows each component value and the ratio math. **Missing:** without an app/user
token the whole score is unavailable (no fabrication, §40).

**Limitations:** live snapshot only; categories change minute to minute.

---

## 6. Title Score (`seo/title`, used by generator + A/B lab)

Deterministic, returns component scores + reasoning:

| Component | Weight |
|---|---|
| Search relevance (term presence/order) | 25% |
| Specificity (numbers, versions, patch) | 15% |
| Curiosity gap | 15% |
| Clarity / readability | 20% |
| Length fit (≈40–70 chars sweet spot) | 10% |
| Platform fit (Shorts vs long-form) | 15% |

A/B lab compares two titles across search relevance, specificity, curiosity,
clarity, expected audience, evergreen vs news potential, and downside. It reports
**"likely strength / likely weakness / best audience"** and must not claim
statistically certain CTR without real experiment data (§15).

---

## 7. Stream Title Score (`platforms/twitch` + `platforms/youtube` live)

Same deterministic components as §6, plus a live/preview mode that re-scores on
each keystroke and lists improvements (add patch, clarify challenge, reduce caps).

---

## 8. Sponsor Readiness (`research/sponsor`)

Operational indicators, not a graded "score" (§68): recent average views,
audience consistency (variance), upload activity, engagement rate, niche clarity
(topic coherence of recent uploads). Output is the raw indicators plus generated
media-kit text; no arbitrary single number is presented as a verdict.

---

## 9. Popularity / Outlier & Pattern confidence (§28–29)

No new 0–100 score. Outputs are:

- **Outlier multiple** = `video views ÷ channel baseline (median of comparable
  age videos)`, reported as e.g. `6.8×`. Baseline window and sample size shown.
- **Pattern lift** = `median(views | pattern present) ÷ median(views | pattern
  absent)` with **sample size** and a **confidence** of `Low/Moderate/High` from
  sample size. Causation is never claimed.

---

## 12. Hook Strength (`core/writing/hooks.ts`)

App-defined heuristic for a video's first spoken sentences. Four equal-weight
components (25% each): length/pacing (words → spoken seconds), front-loaded
payoff, specificity (numbers/concrete nouns), and direct address or tension.
Missing text yields `score: null` ("Not available"), never zero. It is a
packaging heuristic — NOT a retention prediction.

---

## 13. Script structure & shorts review (`core/writing/scripts.ts`)

No aggregate number. Deterministic presence checks (opening/hook, payoff,
next-step segments), plus the §12 hook score applied to the opening lines and to
each planned short's first line. Unresolved items (e.g. a timestamp the creator
must locate) are surfaced as todos, never smoothed over.

---

## 14. Brief completeness (`core/writing/brief.ts`)

Counts filled sections (viewer promise, audience/stakes, angle, proof plan,
beat outline, packaging) and names what is missing. Qualitative only — a brief
contains no performance figures because none exist to ground them.

---

## 15. Stream category comparison (`research/stream-research.ts`)

Wraps the §5 Stream Discovery Score with two extra inputs derived from the
creator's own stored sessions: `creatorHistory` (share of stored sessions in the
category) and `channelSizeFit` (how the category's viewers-per-channel compares
to the creator's median concurrent viewers). Categories not observed in the live
sample get `null` scores and an explicit "not observed ≠ zero" explanation.

---

## 16. Stream Title Assessment (`core/writing/stream-title.ts`)

Live-title heuristic with six components: specificity (patch/version words,
25%), stated goal or content (20%), clarity (20%), length fit (live soft limit
~80 chars, 15%), freshness signals (10%), and "adds beyond category" (10% — a
title that only restates the category wastes the slot). Improvements are
mechanical rules (add patch marker, clarify challenge, reduce caps), never CTR
promises.

---

## 17. Conversion funnel (`core/scores/conversion.ts`)

No aggregate score. Three computable stages — lifetime views→subscribers
(official channel totals), views→likes and views→comments (latest stored
snapshots) — plus the members stage which is **unavailable by design** because
no official API exposes member counts. Suggestions are deterministic
content-specific CTA advice, not engagement-bait.

---

## 18. Weekly plan & next task (`core/planning/weekly.ts`)

No invented best times. The weekly plan maps existing calendar items to their
weekday and adds slots from saved keywords, stalled projects, stated goals and
upload history. The "What should I work on?" task is scored from deadline
proximity (60%), project stage (35%) and channel momentum (20%), and returns
null when nothing is actionable.

---

## 19. Retention planner (`core/writing/retention.ts`)

Proportional beat timelines for tutorial/gaming/review/storytelling formats,
scaled to the creator's target length. These are planning aids; the app states
plainly that they are not measured retention.

---

## 10. Confidence labels (spec §61)

Research cards get `High | Medium | Low` derived from: number of independent
sources, source tier (official platform API > vetted public > AI estimate),
freshness, and agreement between sources. The reasoning for the label is shown,
not just the label.

---

## 11. Batch SEO optimizer (`core/seo/optimizer.ts`)

The "Optimize everything" pass is **deterministic and offline**. It produces a
new title/description/tags draft with explicit rules, then re-scores the draft
with the same §2 engine so the delta is honest.

| Field | Rules applied |
|---|---|
| Title | Collapse whitespace; add the primary keyword at the front when absent; truncate on a word boundary to ≤70 chars (keyword-first, so truncation keeps it); append the first subtopic when the title is under 30 chars |
| Description | Collapse whitespace; prefix `In this video: <keyword>.` when the keyword is not in the first 150 chars; name the subtopics when the description is under 200 chars |
| Tags | Lowercase, trim, de-duplicate, add the primary keyword and expected subtopics, cap at 15 |

Every applied change records `{ field, from, to, reason }`, and the result carries
explicit caveats: the edits are packaging improvements, **not a ranking
guarantee**, and the user must review wording for factual accuracy. When no
primary keyword is set, the optimizer says so instead of guessing one.

AI may offer a separate, labelled variant of this draft; it can never overwrite
these deterministic results.

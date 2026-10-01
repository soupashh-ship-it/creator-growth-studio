import { getServices } from './services'
import { sponsorReadiness, buildMediaKit, type MediaKit } from '../core/scores/sponsor'
import { buildDiagnosisMetrics, diagnosePerformance, type DiagnosisFinding } from '../core/scores/diagnosis'
import { goalProgress, parseGoal, type GoalProgress } from '../core/scores/progress'
import type { ScoreResult } from '../core/scores/engine'

/**
 * Growth services (spec §53, §68, §119).
 *
 * Read-only compositions over stored rows. Nothing here invents values: when
 * snapshots or profile data are missing, the report says so (§66).
 */

export interface SponsorReport {
  readiness: ScoreResult
  mediaKit: MediaKit
  hasData: boolean
  note: string
}

export function buildSponsorReport(workspaceId: string): SponsorReport {
  const { repos } = getServices()
  const videos = repos.listVideos(workspaceId, 500)
  const profile = repos.getCreatorProfile(workspaceId)
  const channels = repos.listChannels(workspaceId)
  const channelTitle = channels[0]?.title ?? 'My channel'

  const hasData = videos.some((v) => v.views !== null)
  const readiness = sponsorReadiness({ videos, niche: profile?.niche ?? null })
  const mediaKit = buildMediaKit(channelTitle, { videos, niche: profile?.niche ?? null })

  return {
    readiness,
    mediaKit,
    hasData,
    note: hasData
      ? 'Computed from stored video data; the media kit is a draft you copy and edit.'
      : 'No stored view data yet — connect a channel and sync to populate the readiness score.',
  }
}

export function diagnoseStoredVideo(workspaceId: string, videoId: string): DiagnosisFinding {
  const { repos } = getServices()
  const videos = repos.listVideos(workspaceId, 500)
  const video = videos.find((v) => v.id === videoId)
  if (!video) {
    return {
      stage: 'insufficient-data',
      summary: 'That video is not in the stored list.',
      evidence: [],
      actions: [],
    }
  }
  const analytics = repos.listLatestVideoAnalytics(workspaceId)
  const own = analytics.find((a) => a.video_id === videoId) ?? null
  const metrics = buildDiagnosisMetrics(video, own ? [own] : [])
  return diagnosePerformance(metrics)
}

export interface ProgressReport {
  goals: GoalProgress[]
  hasProfile: boolean
  note: string
}

export function buildProgressReport(workspaceId: string, now = Date.now()): ProgressReport {
  const { repos } = getServices()
  const profile = repos.getCreatorProfile(workspaceId)
  const snapshots = repos.listChannelSnapshots(workspaceId)
  const samples = snapshots.map((s) => ({
    at: s.at,
    subscriberCount: s.subscriber_count,
    viewCount: s.view_count,
  }))

  const goals: GoalProgress[] = []
  for (const raw of profile?.goals ?? []) {
    const parsed = parseGoal(raw)
    if (!parsed) continue
    goals.push(goalProgress(parsed.goal, parsed.metric, samples, now))
  }

  return {
    goals,
    hasProfile: profile !== null,
    note:
      goals.length === 0
        ? profile === null
          ? 'Add goals like "10k subscribers" on the Creator Memory page to track progress.'
          : 'None of your goals are numeric (e.g. "10k subscribers" or "1m views"), so there is nothing to measure yet.'
        : 'Progress compares real channel snapshots; no completion dates are predicted.',
  }
}

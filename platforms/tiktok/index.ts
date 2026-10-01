import { createPlannedPlatform } from '../planned'

/**
 * TikTok (spec §9, §130) — architecture-ready, not implemented.
 *
 * The TikTok Display API exposes basic profile and video metadata for an
 * authorized user, but requires app review and Login Kit; analytics are only
 * available through a separate reporting product. Until then every data call
 * reports `not_configured` rather than returning invented values.
 */
export const TIKTOK_NOTE =
  'TikTok is not connected. Reading profile, video and analytics data requires a reviewed TikTok app with Login Kit; this adapter is present but not implemented.'

export const TikTokPlatform = createPlannedPlatform({
  id: 'tiktok',
  displayName: 'TikTok',
  capabilities: ['channel', 'content', 'analytics'],
  note: TIKTOK_NOTE,
})

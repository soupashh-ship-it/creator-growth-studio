import { createPlannedPlatform } from '../planned'

/**
 * Instagram (spec §9, §130) — architecture-ready, not implemented.
 *
 * The Instagram Graph API for professional accounts can expose media and
 * insights, but it requires a reviewed Meta app and a business/creator account.
 * Until that is wired, every data call reports `not_configured` rather than
 * returning invented values.
 */
export const INSTAGRAM_NOTE =
  'Instagram is not connected. Reading media and insights requires a reviewed Meta app plus a professional (business/creator) account; this adapter is present but not implemented.'

export const InstagramPlatform = createPlannedPlatform({
  id: 'instagram',
  displayName: 'Instagram',
  capabilities: ['channel', 'content', 'analytics', 'comments'],
  note: INSTAGRAM_NOTE,
})

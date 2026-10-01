/**
 * Pre-live checklist (spec §43).
 *
 * The default checklist is stored in settings and fully user-editable. The app
 * NEVER ticks an item on the user's behalf — every checkbox is honest manual
 * confirmation. Items that the app can actually help with link to the page
 * that helps.
 */
export interface ChecklistItem {
  id: string
  label: string
  /** Where in the app the user can handle this item, when applicable. */
  linkPage?: string
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'title', label: 'Stream title ready (use the Stream Title Assistant)', linkPage: 'Stream Optimizer' },
  { id: 'category', label: 'Correct category selected' },
  { id: 'tags', label: 'Tags / stream description set' },
  { id: 'thumbnail', label: 'Live thumbnail ready (YouTube)' },
  { id: 'recording', label: 'Recording enabled if you want a VOD' },
  { id: 'obs-scene', label: 'OBS scene + game capture checked', linkPage: 'Stream Health' },
  { id: 'audio', label: 'Audio levels checked' },
  { id: 'chat', label: 'Chat rules / moderation ready' },
  { id: 'social', label: 'Social post drafted (Community Planner)', linkPage: 'Community Planner' },
  { id: 'schedule', label: 'Stream on the calendar', linkPage: 'Calendar' },
]

export function isDefaultChecklist(items: ChecklistItem[]): boolean {
  return (
    items.length === DEFAULT_CHECKLIST.length &&
    items.every((item, index) => item.id === DEFAULT_CHECKLIST[index]?.id && item.label === DEFAULT_CHECKLIST[index]?.label)
  )
}

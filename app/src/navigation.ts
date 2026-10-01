/**
 * Sidebar navigation tree, transcribed from spec §72.
 * Purely structural — pages are added as their feature slices land.
 */
export interface NavGroup {
  label: string
  items: string[]
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Home', items: ['Dashboard', 'AI Strategist'] },
  {
    label: 'Create',
    items: [
      'Video Ideas',
      'SEO Studio',
      'Titles',
      'Thumbnails',
      'Video Brief',
      'Hooks',
      'Scripts',
      'Shorts',
    ],
  },
  { label: 'Research', items: ['Keywords', 'Trends', 'Competitors', 'Content Gaps', 'Opportunities'] },
  { label: 'Analytics', items: ['Channel', 'Videos', 'Retention', 'Audience', 'Experiments'] },
  { label: 'Live', items: ['Stream Optimizer', 'Twitch Research', 'Stream Health'] },
  { label: 'Community', items: ['Comments', 'Members', 'Community Planner'] },
  { label: 'Planning', items: ['Calendar', 'Projects'] },
  { label: 'AI', items: ['Creator Copilot', 'Research'] },
  { label: 'Settings', items: ['Connections', 'AI Providers', 'Creator Memory', 'Data', 'Appearance', 'Advanced', 'Developer Tools'] },
]

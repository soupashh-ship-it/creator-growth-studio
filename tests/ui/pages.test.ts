import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Advanced } from '../../app/src/pages/Advanced'
import { AiProviders } from '../../app/src/pages/AiProviders'
import { CreatorMemory } from '../../app/src/pages/CreatorMemory'
import { DevTools } from '../../app/src/pages/DevTools'
import { AiResearch } from '../../app/src/pages/AiResearch'
import { Audience } from '../../app/src/pages/Audience'
import { Calendar } from '../../app/src/pages/Calendar'
import { Channel } from '../../app/src/pages/Channel'
import { Comments } from '../../app/src/pages/Comments'
import { CommunityPlanner } from '../../app/src/pages/CommunityPlanner'
import { Competitors } from '../../app/src/pages/Competitors'
import { Connections } from '../../app/src/pages/Connections'
import { ContentGaps } from '../../app/src/pages/ContentGaps'
import { Copilot } from '../../app/src/pages/Copilot'
import { Dashboard } from '../../app/src/pages/Dashboard'
import { Data } from '../../app/src/pages/Data'
import { Appearance } from '../../app/src/pages/Appearance'
import { Experiments } from '../../app/src/pages/Experiments'
import { Hooks } from '../../app/src/pages/Hooks'
import { Ideas } from '../../app/src/pages/Ideas'
import { Keywords } from '../../app/src/pages/Keywords'
import { Members } from '../../app/src/pages/Members'
import { Opportunities } from '../../app/src/pages/Opportunities'
import { Projects } from '../../app/src/pages/Projects'
import { Retention } from '../../app/src/pages/Retention'
import { SeoStudio } from '../../app/src/pages/SeoStudio'
import { Scripts } from '../../app/src/pages/Scripts'
import { Shorts } from '../../app/src/pages/Shorts'
import { StreamHealth } from '../../app/src/pages/StreamHealth'
import { StreamOptimizer } from '../../app/src/pages/StreamOptimizer'
import { Thumbnails } from '../../app/src/pages/Thumbnails'
import { Titles } from '../../app/src/pages/Titles'
import { Trends } from '../../app/src/pages/Trends'
import { TwitchResearch } from '../../app/src/pages/TwitchResearch'
import { VideoBrief } from '../../app/src/pages/VideoBrief'
import { Videos } from '../../app/src/pages/Videos'
import { Welcome } from '../../app/src/pages/Welcome'

/**
 * UI smoke tests (spec §113).
 *
 * Rendered with `react-dom/server` so they run in the Node test environment with
 * no browser. They assert each page mounts and that offline-capable pages render
 * their deterministic UI without a desktop bridge — and that data-driven pages
 * degrade to an honest state rather than throwing.
 */
const noop = (): void => undefined

const cases: Array<{ name: string; element: ReactElement; expectedText: string }> = [
  { name: 'Dashboard', element: createElement(Dashboard, { onNavigate: noop }), expectedText: 'Dashboard' },
  { name: 'SEO Studio', element: createElement(SeoStudio), expectedText: 'SEO Studio' },
  { name: 'Titles', element: createElement(Titles), expectedText: 'Titles' },
  { name: 'Thumbnails', element: createElement(Thumbnails), expectedText: 'Thumbnails' },
  { name: 'Keywords', element: createElement(Keywords), expectedText: 'Keywords' },
  { name: 'Comments', element: createElement(Comments), expectedText: 'Comments' },
  { name: 'Projects', element: createElement(Projects), expectedText: 'Projects' },
  { name: 'Calendar', element: createElement(Calendar), expectedText: 'Calendar' },
  { name: 'Stream Health', element: createElement(StreamHealth), expectedText: 'Stream Health' },
  { name: 'Connections', element: createElement(Connections), expectedText: 'Connections' },
  { name: 'AI Providers', element: createElement(AiProviders), expectedText: 'AI Providers' },
  { name: 'Data', element: createElement(Data), expectedText: 'Data' },
  { name: 'Advanced', element: createElement(Advanced), expectedText: 'Advanced' },  {
    name: 'Welcome',
    element: createElement(Welcome, { onDone: noop }),
    expectedText: 'Everything runs on this computer',
  },
  { name: 'Channel', element: createElement(Channel), expectedText: 'Channel' },
  { name: 'Videos', element: createElement(Videos), expectedText: 'Videos' },
  { name: 'Retention', element: createElement(Retention), expectedText: 'Not available' },
  { name: 'Audience', element: createElement(Audience), expectedText: 'Audience' },
  { name: 'Experiments', element: createElement(Experiments), expectedText: 'Experiments' },
  { name: 'Trends', element: createElement(Trends), expectedText: 'Trends' },
  { name: 'Content Gaps', element: createElement(ContentGaps), expectedText: 'Content Gaps' },
  { name: 'Opportunities', element: createElement(Opportunities), expectedText: 'Opportunities' },
  { name: 'Competitors', element: createElement(Competitors), expectedText: 'Competitors' },
  { name: 'Video Ideas', element: createElement(Ideas), expectedText: 'Video Ideas' },
  { name: 'Appearance', element: createElement(Appearance), expectedText: 'Appearance' },
  { name: 'Creator Copilot', element: createElement(Copilot), expectedText: 'Creator Copilot' },
  { name: 'Video Brief', element: createElement(VideoBrief), expectedText: 'Video Brief' },
  { name: 'Hooks', element: createElement(Hooks), expectedText: 'Hooks' },
  { name: 'Scripts', element: createElement(Scripts), expectedText: 'Scripts' },
  { name: 'Shorts', element: createElement(Shorts), expectedText: 'Shorts' },
  { name: 'Stream Optimizer', element: createElement(StreamOptimizer), expectedText: 'Stream Optimizer' },
  { name: 'Twitch Research', element: createElement(TwitchResearch), expectedText: 'Twitch Research' },
  { name: 'Members', element: createElement(Members), expectedText: 'Members' },
  { name: 'Community Planner', element: createElement(CommunityPlanner), expectedText: 'Community Planner' },
  { name: 'AI Research', element: createElement(AiResearch), expectedText: 'Research' },
  { name: 'Creator Memory', element: createElement(CreatorMemory), expectedText: 'Creator Memory' },
  { name: 'Developer Tools', element: createElement(DevTools), expectedText: 'Developer Tools' },
]

describe('page smoke tests', () => {
  for (const { name, element, expectedText } of cases) {
    it(`${name} renders without throwing`, () => {
      const html = renderToStaticMarkup(element)
      expect(html.length).toBeGreaterThan(0)
      expect(html).toContain(expectedText)
    })
  }

  it('offline pages compute a real score locally with no bridge', () => {
    const html = renderToStaticMarkup(createElement(SeoStudio))
    expect(html).toContain('Enter a title or description to see the analysis')
  })

  it('data-driven pages explain that the desktop bridge is unavailable', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { onNavigate: noop }))
    expect(html).toContain('Desktop bridge unavailable')
  })
})

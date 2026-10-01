import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { CommandPalette, type Command } from './components/CommandPalette'
import { NotificationBell } from './components/NotificationBell'
import { IPC } from './bridge'
import { NAV_GROUPS } from './navigation'
import { callIpc, useIpc } from './useIpc'
import { Advanced } from './pages/Advanced'
import { AiProviders } from './pages/AiProviders'
import { AiResearch } from './pages/AiResearch'
import { Audience } from './pages/Audience'
import { Calendar } from './pages/Calendar'
import { Channel } from './pages/Channel'
import { Comments } from './pages/Comments'
import { CommunityPlanner } from './pages/CommunityPlanner'
import { Competitors } from './pages/Competitors'
import { Connections } from './pages/Connections'
import { CreatorMemory } from './pages/CreatorMemory'
import { ContentGaps } from './pages/ContentGaps'
import { Copilot } from './pages/Copilot'
import { Dashboard } from './pages/Dashboard'
import { Data } from './pages/Data'
import { DevTools } from './pages/DevTools'
import { Appearance, applyTheme } from './pages/Appearance'
import { Experiments } from './pages/Experiments'
import { Hooks } from './pages/Hooks'
import { Ideas } from './pages/Ideas'
import { Keywords } from './pages/Keywords'
import { Members } from './pages/Members'
import { Opportunities } from './pages/Opportunities'
import { Retention } from './pages/Retention'
import { Scripts } from './pages/Scripts'
import { Shorts } from './pages/Shorts'
import { Trends } from './pages/Trends'
import { Videos } from './pages/Videos'
import { Projects } from './pages/Projects'
import { SeoStudio } from './pages/SeoStudio'
import { StreamHealth } from './pages/StreamHealth'
import { StreamOptimizer } from './pages/StreamOptimizer'
import { Thumbnails } from './pages/Thumbnails'
import { Titles } from './pages/Titles'
import { TwitchResearch } from './pages/TwitchResearch'
import { VideoBrief } from './pages/VideoBrief'
import { Welcome } from './pages/Welcome'

const ONBOARDED_KEY = 'cgs.onboarded'

function NotImplemented({ page }: { page: string }): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{page}</h1>
      <p className="mt-2 max-w-2xl text-[var(--color-text-secondary)]">
        Not implemented yet. The app is built in the order defined by spec §92 (architecture →
        database → auth → AI providers → platforms → engines → UI). No placeholder metrics or
        fabricated analytics are shown while a feature is pending.
      </p>
    </div>
  )
}

function renderPage(active: string, onNavigate: (page: string) => void): JSX.Element {
  switch (active) {
    case 'Dashboard':
      return <Dashboard onNavigate={onNavigate} />
    case 'SEO Studio':
      return <SeoStudio />
    case 'Titles':
      return <Titles />
    case 'Thumbnails':
      return <Thumbnails />
    case 'Keywords':
      return <Keywords />
    case 'Comments':
      return <Comments />
    case 'Projects':
      return <Projects />
    case 'Calendar':
      return <Calendar />
    case 'Stream Health':
      return <StreamHealth />
    case 'Connections':
      return <Connections />
    case 'AI Providers':
      return <AiProviders />
    case 'Creator Memory':
      return <CreatorMemory />
    case 'Data':
      return <Data />
    case 'Advanced':
      return <Advanced />
    case 'Developer Tools':
      return <DevTools />
    case 'Channel':
      return <Channel />
    case 'Videos':
      return <Videos />
    case 'Retention':
      return <Retention />
    case 'Audience':
      return <Audience />
    case 'Experiments':
      return <Experiments />
    case 'Trends':
      return <Trends />
    case 'Content Gaps':
      return <ContentGaps />
    case 'Opportunities':
      return <Opportunities />
    case 'Competitors':
      return <Competitors />
    case 'Creator Copilot':
    case 'AI Strategist':
      return <Copilot />
    case 'Video Ideas':
      return <Ideas />
    case 'Video Brief':
      return <VideoBrief />
    case 'Hooks':
      return <Hooks />
    case 'Scripts':
      return <Scripts />
    case 'Shorts':
      return <Shorts />
    case 'Stream Optimizer':
      return <StreamOptimizer />
    case 'Twitch Research':
      return <TwitchResearch />
    case 'Members':
      return <Members />
    case 'Community Planner':
      return <CommunityPlanner />
    case 'Research':
      return <AiResearch />
    case 'Appearance':
      return <Appearance />
    default:
      return <NotImplemented page={active} />
  }
}

interface WorkspaceRow {
  id: string
  name: string
}

// Declared at module scope so the JSX map below needs no inferred-any params.
const workspaceKey = (workspace: WorkspaceRow): string => workspace.id

const readOnboarded = (): boolean => {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true
  }
}

export function App(): JSX.Element {
  const [active, setActive] = useState('Dashboard')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [onboarded, setOnboarded] = useState(readOnboarded)
  const workspaces = useIpc<WorkspaceRow[]>(IPC.workspacesList)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  async function switchWorkspace(id: string): Promise<void> {
    try {
      const result = await callIpc<{ ok: boolean }>(IPC.workspacesSetActive, { id })
      if (result.ok) {
        setActiveWorkspaceId(id)
        // All data views read from the active workspace — refresh them by
        // reloading so every useIpc re-runs against the new workspace.
        window.location.reload()
      }
    } catch {
      // Switching failing leaves the current workspace active.
    }
  }

  const finishOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      // Storage being unavailable must not block the app.
    }
    setOnboarded(true)
  }, [])

  const navigate = useCallback((page: string) => setActive(page), [])

  // Apply the saved theme once on mount. This touches an external system (the
  // document) rather than local state, so it does not cascade renders.
  useEffect(() => {
    void callIpc<unknown>('settings:get', { key: 'theme' })
      .then((stored) => applyTheme(stored === 'light' ? 'light' : 'dark'))
      .catch(() => undefined)
  }, [])

  // Global shortcuts (spec §80, §126). Only combinations the app can own;
  // system/browser shortcuts are not overridden.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      } else if (key === 'n') {
        event.preventDefault()
        setActive('Projects')
      } else if (key === ',') {
        event.preventDefault()
        setActive('Appearance')
      } else if (key === 'r' && !event.shiftKey) {
        // Ctrl+R: refresh page data by remounting the active page. Plain F5/
        // browser reload semantics are not intercepted.
        event.preventDefault()
        setActive((current) => current)
        window.location.reload()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commands = useMemo<Command[]>(() => {
    const navigation: Command[] = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `nav:${item}`,
        label: item,
        group: group.label,
        run: () => navigate(item),
      })),
    )
    const actions: Command[] = [
      {
        id: 'action:backup',
        label: 'Back up data now',
        group: 'Action',
        run: () => {
          void callIpc(IPC.dataExport).catch(() => undefined)
        },
      },
      {
        id: 'action:clear-ai-cache',
        label: 'Clear AI result cache',
        group: 'Action',
        run: () => {
          void callIpc(IPC.aiCacheClear).catch(() => undefined)
        },
      },
    ]
    return [...navigation, ...actions]
  }, [navigate])

  if (!onboarded) return <Welcome onDone={finishOnboarding} />

  return (
    <div className="flex h-full w-full">
      <nav
        aria-label="Primary"
        className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] px-3 py-4"
      >
        <div className="px-2">
          <div className="text-sm font-semibold tracking-wide">Creator Growth Studio</div>
          <div className="text-xs text-[var(--color-text-muted)]">Local-first · in development</div>
        </div>

        {workspaces.data && workspaces.data.length > 1 && (
          <select
            value={activeWorkspaceId ?? workspaces.data[0]?.id ?? ''}
            onChange={(e) => void switchWorkspace(e.target.value)}
            aria-label="Active workspace"
            className="mx-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12px]"
          >
            {workspaces.data.map((workspace) => (
              <option key={workspaceKey(workspace)} value={workspaceKey(workspace)}>
                {workspace.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-1 flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] px-2 py-1.5 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
        >
          <span>Jump to…</span>
          <kbd className="text-[10px]">Ctrl K</kbd>
        </button>

        <NotificationBell />

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {group.label}
            </div>
            <ul>
              {group.items.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => setActive(item)}
                    aria-current={active === item ? 'page' : undefined}
                    className={
                      'w-full rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ' +
                      (active === item
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]')
                    }
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-8">{renderPage(active, navigate)}</main>

      {paletteOpen && (
        <CommandPalette open commands={commands} onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  )
}

// gokul-hub: one mod that hosts my other mods.
//
// The hub pane (docked on the right in the fullscreen layout, /hub anywhere)
// has three tabs: Activity (every tool call as a card), Flags (what's worth
// knowing) and Usage (context, plan limits, Blast Radius, Replay). Decisions
// (approvals, risky commands) come up as cards with buttons. The band above
// the prompt is one line for everything. The look follows the Theme setting.
//
// Each feature lives in hooks/features/ as top-level functions, called by
// name below: the engine reads `on` and `$` calls from source, so they can't
// go through a list of objects, and an event without a matcher is hooked once
// here for all of them. To add one, see "Adding a feature" in README.md.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput, Register } from 'claude-code'

import type { Flag, HubTab } from '../types'
import { card, flagRow } from './card'
import { drawDecisionBand, drawDecisionPane, waitingOn } from './decide'
import {
  activityFinish,
  activitySection,
  activitySessionStart,
  activityStart,
  activitySummary,
  registerActivity,
  setSidebar,
} from './features/activity'
import { registerApprovals, setApprovalCards } from './features/approvals'
import { browserSessionStart, openInBrowser } from './features/browser'
import { blastFlags, blastSection, registerBlastRadius } from './features/blast-radius'
import {
  registerReplay,
  replayBandButtons,
  replayClosed,
  replayRecord,
  replaySection,
  replaySessionStart,
  replaySummary,
  replayTurnComplete,
} from './features/replay'
import {
  registerWeather,
  weatherFlags,
  weatherSection,
  weatherSessionStart,
  weatherSummary,
  weatherTurnComplete,
} from './features/weather'
import { HUB_PANE, LEVEL_RANK, setHubShowing } from './hub'
import { applyTheme, pal, setThemeSetting, themeReport, themeSetting, toggleTheme } from './theme'

const tab = atom({ plugin: 'gokul-hub', key: 'tab' } as const, 'activity' as HubTab)

let isSidebarOn = true
// Opened unasked once per load, where the pane would be a sidebar.
let hasAutoOpened = false

function levelColor(level: Flag['level']) {
  const p = pal()
  return level === 'alert' ? p.error : level === 'warn' ? p.warning : p.muted
}

async function allFlags($: EngineInterface): Promise<Flag[]> {
  const flags = [...(await blastFlags($)), ...(await weatherFlags($))]
  return flags.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
}

async function allSummaries($: EngineInterface): Promise<string[]> {
  const parts = [await weatherSummary($), await activitySummary($), await replaySummary($)]
  return parts.filter((p): p is string => Boolean(p))
}

function openHub($: EngineInterface) {
  return $.ui.open({ id: HUB_PANE, title: 'gokul-hub' })
}

async function usageTab($: EngineInterface, e: RenderInput, columns: number): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const sections = [
    { id: 'weather', icon: '☀', title: 'Context & limits', body: await weatherSection($, e, columns) },
    { id: 'blast', icon: '⚠', title: 'Blast Radius', body: await blastSection($, e) },
    { id: 'replay', icon: '▶', title: 'Replay', body: await replaySection($, e) },
  ]
  return (
    <els.Box flexDirection="column">
      {sections
        .filter(s => s.body !== null)
        .map(s => card(els, { key: s.id, icon: s.icon, title: s.title, rows: [s.body!] }))}
    </els.Box>
  )
}

function flagsTab($: EngineInterface, e: RenderInput, flags: Flag[]): RenderElement {
  const els = $.ui.resolve(e)
  const p = pal()
  if (!flags.length) {
    return card(els, {
      icon: '✓',
      title: 'Nothing to flag',
      rows: [<els.Text color={p.muted}>All clear: context, limits and commands look fine.</els.Text>],
    })
  }
  return card(els, {
    icon: '⚑',
    title: `${flags.length} worth knowing`,
    tone: flags[0]!.level === 'alert' ? 'error' : 'warning',
    rows: flags.map(f => flagRow(els, f.id, levelColor(f.level), f.text)),
  })
}

async function hubPane($: EngineInterface, e: RenderInput & { component: 'Pane' }): Promise<RenderElement> {
  setHubShowing(true)
  const { Box, Text, Button } = $.ui.resolve(e)
  const p = pal()
  const columns = Math.max(30, e.props.bodyColumns)
  const current = await read($, tab)
  const flags = await allFlags($)
  const loud = flags.filter(f => f.level !== 'info')

  const tabButton = (id: HubTab, label: string, hotkey: string) => (
    <Button key={`tab-${id}`} plain hotkey={hotkey} onPress={() => update($, tab, () => id)}>
      <Text color={current === id ? p.accent : p.muted} bold={current === id} underline={current === id}>{label}</Text>
    </Button>
  )
  const body =
    current === 'flags'
      ? flagsTab($, e, flags)
      : current === 'usage'
        ? await usageTab($, e, columns)
        : await activitySection($, e, columns, waitingOn())
  const isLight = themeSetting() === 'vscode-light'

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={p.accent} bold>◆ </Text>
          <Text color={p.text} bold>gokul-hub</Text>
        </Text>
        <Box flexDirection="row" gap={2}>
          <Button key="browser" plain hotkey="b" onPress={() => openInBrowser($)}>
            <Text color={p.muted}>⧉ Browser</Text>
          </Button>
          {themeSetting() === 'off' ? null : (
            <Button key="theme" plain hotkey="t" onPress={() => void $.clock.after(0, () => void toggleTheme($))}>
              <Text color={p.muted}>{isLight ? '☾ Dark' : '☀ Light'}</Text>
            </Button>
          )}
        </Box>
      </Box>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        {tabButton('activity', 'Activity', 'a')}
        {tabButton('flags', loud.length ? `Flags ⚑${loud.length}` : 'Flags', 'f')}
        {tabButton('usage', 'Usage', 'u')}
      </Box>
      {body}
    </Box>
  )
}

export const register: Register = (on, options) => {
  setThemeSetting(options.theme)
  setSidebar(options.sidebar)
  setApprovalCards(options.approvalCards)
  isSidebarOn = options.sidebar !== false

  registerWeather(on)
  registerBlastRadius(on)
  registerApprovals(on)
  registerActivity(on)
  registerReplay(on)

  // One hook per event that takes no matcher: each feature's part is called here.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'hub', description: 'gokul-hub: open the sidebar (add activity, flags or usage to pick a tab)' })
    await $.command.register({ name: 'hub-theme', description: 'gokul-hub: switch between VS Code dark and light' })
    await $.command.register({ name: 'hub-doctor', description: 'gokul-hub: report the theme and settings it sees' })
    await activitySessionStart($)
    await browserSessionStart($)
    await weatherSessionStart($)
    await replaySessionStart($)
    try {
      await applyTheme($)
    } catch {
      // the theme stays as it was
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    try {
      await activityStart($, id, e.tool, e, e.agentId)
      await replayRecord($, e as unknown as Record<string, unknown>)
    } catch {
      // recording must never stop the call
    }
    const result = await next(e)
    try {
      await activityFinish($, id, e.tool, e, result as { deny?: string; isError?: true; text?: string })
    } catch {
      // nor its result
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    await weatherTurnComplete($)
    await replayTurnComplete($)
    return result
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === HUB_PANE) setHubShowing(false)
    await replayClosed($, e.id)
    return next(e)
  }).catch(($, e, next) => next(e))

  // /hub opens the sidebar; /hub activity|flags|usage also picks the tab.
  on('command.run', { command: 'hub' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    const picked = (['activity', 'flags', 'usage'] as const).find(t => t.startsWith(want) && want !== '')
    if (picked) await update($, tab, () => picked)
    const opened = await openHub($)
    if (!opened.isPlaced) return { text: 'waiting for room to open: widen the terminal or use the fullscreen layout.' }
    return { text: picked ? `opened on ${picked}.` : 'opened.' }
  })

  on('command.run', { command: 'hub-theme' }, async $ => {
    if (themeSetting() === 'off') return { text: 'the theme is off: turn it on in /config (gokul-hub › Theme).' }
    const to = themeSetting() === 'vscode-light' ? 'Dark' : 'Light'
    // The change reloads this mod, so it runs once this command has answered.
    $.clock.after(0, () => void toggleTheme($))
    return { text: `switching to VS Code ${to}. Claude Code's own colours follow on its next start.` }
  })

  on('command.run', { command: 'hub-doctor' }, async $ => {
    try {
      return { text: `doctor\n${await themeReport($)}` }
    } catch (error) {
      return { text: `doctor: ${String((error as Error)?.message ?? error)}` }
    }
  })

  // The matchers' ids are spelled out: the engine reads them from source.
  // 'gokul-hub' is HUB_PANE; 'gokul-hub-decide' is DECIDE_PANE.
  on('ui.render', { component: 'Pane', requestId: 'gokul-hub' }, ($, e) => hubPane($, e))
  on('ui.render', { component: 'Pane', requestId: 'gokul-hub-decide' }, ($, e, next) => drawDecisionPane($, e) ?? next(e))

  // The one line above the prompt: a decision takes it whole where no pane
  // could be placed; else each feature's few words, the flag count, buttons.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!hasAutoOpened && isSidebarOn && e.viewport?.isFullscreen === true) {
      hasAutoOpened = true
      void openHub($)
    }
    const decision = drawDecisionBand($, e)
    if (decision !== null) return decision
    if (e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const p = pal()
    const parts = await allSummaries($)
    const flags = (await allFlags($)).filter(f => f.level !== 'info')
    const replayButtons = await replayBandButtons($, e)

    return (
      <Box flexDirection="row" gap={1} paddingX={1}>
        <Text color={p.accent} bold>◆</Text>
        {flags.length > 0 ? <Text color={levelColor(flags[0]!.level)} bold>⚑ {flags.length}</Text> : null}
        <Text color={p.muted} wrap="truncate-end">{parts.join('  │  ')}</Text>
        <Button key="hub" label="Hub" hotkey="h" onPress={() => void openHub($)} />
        {replayButtons}
      </Box>
    )
  })
}

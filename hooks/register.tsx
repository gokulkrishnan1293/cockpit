// cockpit: one pane on the right (docked in the fullscreen layout,
// /cockpit anywhere). At the top, the main session as a supercomputer; under
// it, the usage bars (context, the session limit, the weekly limit); then the
// tabs, the first of them Subagents. The colours follow Claude Code's theme.
// The terminal draws the pictures in block characters; the desktop app, VS
// Code and the mobile app draw them as SVG.
//
// Each feature lives in its own file as top-level functions, called by name
// below: the engine reads `on` and `$` calls from source, so they can't go
// through a list of objects, and an event without a matcher is hooked once
// here for all of them.

import type { EngineInterface, RenderElement, RenderInput, Register } from 'claude-code'

import { agentsSessionStart, registerAgents, runningCount, subStep, subsTab, subToolFinish, subToolStart } from './agents'
import { COCKPIT_PANE } from './hub'
import { dividerSvg } from './svg'
import { mainIsWorking, scene, sceneModel, sceneSessionStart, sceneTurnComplete, sceneTurnStart } from './scene'
import { pal, readTheme, themeChanged } from './theme'
import { ledColor, registerUsage, usageHeader, usageSessionStart } from './usage'

function openCockpit($: EngineInterface) {
  return $.ui.open({ id: COCKPIT_PANE, title: 'cockpit' })
}

// The tabs under the usage card, the first of them Subagents. Each is
// { id, label, count }; the bar grows as features come back.
async function tabs($: EngineInterface) {
  return [{ id: 'subagents', label: 'Subagents', count: await runningCount($) }]
}

async function cockpitPane($: EngineInterface, e: RenderInput & { component: 'Pane' }): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  // The remote surfaces' vector leaf: a real line there, where `─` text falls short.
  const Svg = (els as { Svg?: (props: { source: string; alt: string }) => RenderElement }).Svg
  const p = pal()
  // The pane's own padding takes 2 columns.
  const columns = Math.max(20, e.props.bodyColumns - 2)
  const list = await tabs($)
  const current = 'subagents'

  // The terminal: folder tabs in box-drawing characters, the active one's
  // bottom open onto the list below, the rest closed on the rule. Elsewhere a
  // tab bar: each tab a rounded chip, the active one in the accent colour with
  // its count as a badge, sitting on a line across the pane.
  const tabText = (t: { label: string; count: number }) => (t.count ? `${t.label}  ${t.count}` : t.label)
  const tabBar =
    e.surface === 'terminal' || !Svg ? (
      <Box flexDirection="column">
        <Text>
          {list.map(t => {
            const w = tabText(t).length + 2
            return <Text key={`tt-${t.id}`} color={t.id === current ? p.accent : p.border}>{`╭${'─'.repeat(w)}╮`}</Text>
          })}
        </Text>
        <Text>
          {list.map(t => {
            const isActive = t.id === current
            return (
              <Text key={`tm-${t.id}`}>
                <Text color={isActive ? p.accent : p.border}>│ </Text>
                <Text color={isActive ? p.accent : p.muted} bold={isActive}>{t.label}</Text>
                {t.count ? <Text color={p.accent} bold>{`  ${t.count}`}</Text> : null}
                <Text color={isActive ? p.accent : p.border}> │</Text>
              </Text>
            )
          })}
        </Text>
        <Text>
          {list.map(t => {
            const w = tabText(t).length + 2
            return t.id === current ? (
              <Text key={`tb-${t.id}`} color={p.accent}>{`╯${' '.repeat(w)}╰`}</Text>
            ) : (
              <Text key={`tb-${t.id}`} color={p.border}>{`┴${'─'.repeat(w)}┴`}</Text>
            )
          })}
          <Text color={p.border}>{'─'.repeat(Math.max(0, columns - list.reduce((n, t) => n + tabText(t).length + 4, 0)))}</Text>
        </Text>
      </Box>
    ) : (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {list.map(t => {
            const isActive = t.id === current
            return (
              <Box key={`tab-${t.id}`} borderStyle="round" borderColor={isActive ? p.accent : p.border} paddingX={1}>
                <Button key={`tab-button-${t.id}`} plain onPress={() => undefined}>
                  <Text color={isActive ? p.accent : p.muted} weight={isActive ? 'semibold' : 'regular'}>{t.label}</Text>
                  {t.count ? <Text color={p.accent} weight="semibold">{`  ${t.count}`}</Text> : ''}
                </Button>
              </Box>
            )
          })}
        </Box>
        <Box marginBottom={1}>
          <Svg source={dividerSvg(p)} alt=" " />
        </Box>
      </Box>
    )

  return (
    <Box flexDirection="column" paddingX={1}>
      {await scene($, e, await ledColor($))}
      {await usageHeader($, e, columns, await mainIsWorking($))}
      <Box flexDirection="column" marginTop={1}>
        {tabBar}
        {await subsTab($, e, columns)}
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  registerUsage(on)
  registerAgents(on)

  // One hook per event that takes no matcher: each feature's part is called here.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'cockpit', description: 'cockpit: open the cockpit pane' })
    try {
      await readTheme($)
    } catch {
      // the dark colours stand
    }
    await usageSessionStart($)
    await sceneSessionStart($)
    await agentsSessionStart($)
    // Docks on the right once there's room for it.
    void openCockpit($)
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await sceneTurnStart($).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await sceneTurnComplete($).catch(() => undefined)
    return result
  })

  // A streaming event: forward every chunk, then read the step's result.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      if (!e.agentId) await sceneModel($, e.model)
      else if (result.usage) await subStep($, e.agentId, result.usage)
    } catch {
      // the last figures stand
    }
    return result
  })

  // A subagent's calls: what it is doing now, and what it did.
  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (!agentId) return next(e)
    await subToolStart($, agentId, e.tool, e).catch(() => undefined)
    const result = await next(e)
    await subToolFinish($, agentId, e.tool, e, Boolean((result as { isError?: true }).isError || 'deny' in result)).catch(
      () => undefined,
    )
    return result
  }).catch(($, e, next) => next(e))

  // The colours follow the theme however it changes: /theme or /config.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (!('deny' in result && result.deny)) themeChanged(e.value)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'cockpit' }, async $ => {
    const opened = await openCockpit($)
    if (!opened.isPlaced) return { text: 'waiting for room to open: widen the terminal or use the fullscreen layout.' }
    return { text: 'opened.' }
  })

  // 'cockpit' is COCKPIT_PANE, spelled out: the engine reads it from source.
  on('ui.render', { component: 'Pane', requestId: 'cockpit' }, ($, e) => cockpitPane($, e))
}

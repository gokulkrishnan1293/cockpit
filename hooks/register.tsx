// gokul-hub: one mod that hosts my other mods.
//
// The hub pane (docked on the right in the fullscreen layout, /hub anywhere)
// shows every feature's flags first, then each feature's section. The band
// above the prompt is one line for all of them, so no two features fight over
// it. Each feature lives in hooks/features/ as top-level functions, called by
// name below: the engine reads `on` and `$` calls from source, so they can't
// go through a list of objects. To add one, see "Adding a feature" in README.md.

import type { EngineInterface, RenderElement, RenderInput, Register } from 'claude-code'

import type { Flag } from '../types'
import { blastBandOverride, blastFlags, blastSection, registerBlastRadius } from './features/blast-radius'
import {
  registerReplay,
  replayBandButtons,
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
import { HUB_PANE, LEVEL_COLOR, LEVEL_RANK } from './hub'

// Opened unasked once per load, where the pane would be a sidebar.
let hasAutoOpened = false

async function allFlags($: EngineInterface): Promise<Flag[]> {
  const flags = [...(await blastFlags($)), ...(await weatherFlags($))]
  return flags.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
}

async function allSummaries($: EngineInterface): Promise<string[]> {
  const parts = [await weatherSummary($), await replaySummary($)]
  return parts.filter((p): p is string => Boolean(p))
}

async function allSections($: EngineInterface, e: RenderInput, columns: number) {
  return [
    { id: 'weather', title: 'Weather', body: await weatherSection($, e, columns) },
    { id: 'blast', title: 'Blast Radius', body: await blastSection($, e) },
    { id: 'replay', title: 'Replay', body: await replaySection($, e) },
  ]
}

function openHub($: EngineInterface) {
  return $.ui.open({ id: HUB_PANE, title: 'gokul-hub' })
}

async function hubPane($: EngineInterface, e: RenderInput & { component: 'Pane' }): Promise<RenderElement> {
  const { Box, Text } = $.ui.resolve(e)
  const flags = await allFlags($)
  const sections = await allSections($, e, Math.max(30, e.props.bodyColumns))
  const loud = flags.filter(f => f.level !== 'info')

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={loud.length ? LEVEL_COLOR[loud[0]!.level] : 'green'}>
        {loud.length ? `⚑ ${loud.length} worth knowing` : '✓ Nothing to flag'}
      </Text>
      {flags.map(f => (
        <Text color={LEVEL_COLOR[f.level]} dimColor={f.level === 'info'} wrap="wrap">
          {f.level === 'info' ? '·' : '●'} {f.text}
        </Text>
      ))}
      {sections
        .filter(s => s.body !== null)
        .map(s => (
          <Box key={s.id} flexDirection="column" marginTop={1}>
            <Text bold color="cyan">{s.title}</Text>
            {s.body}
          </Box>
        ))}
    </Box>
  )
}

export const register: Register = on => {
  registerWeather(on)
  registerBlastRadius(on)
  registerReplay(on)

  // One hook per event that takes no matcher: each feature's part is called here.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'hub', description: 'gokul-hub: open the pane of flags and mod status' })
    await weatherSessionStart($)
    await replaySessionStart($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    await weatherTurnComplete($)
    await replayTurnComplete($)
    return result
  })

  on('command.run', { command: 'hub' }, async $ => {
    const opened = await openHub($)
    return { text: opened.isPlaced ? 'gokul-hub opened.' : 'gokul-hub is waiting for room to open.' }
  })

  // The matcher's id is spelled out: the engine reads it from source. It is HUB_PANE.
  on('ui.render', { component: 'Pane', requestId: 'gokul-hub' }, ($, e) => hubPane($, e))

  // The one line above the prompt: a held command takes it whole where no
  // pane could be placed; else each feature's few words, the flag count and
  // the buttons.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!hasAutoOpened && e.viewport?.isFullscreen === true) {
      hasAutoOpened = true
      void openHub($)
    }
    const held = await blastBandOverride($, e)
    if (held !== null) return held
    if (e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const parts = await allSummaries($)
    const flags = (await allFlags($)).filter(f => f.level !== 'info')
    const replayButtons = await replayBandButtons($, e)

    return (
      <Box flexDirection="row" gap={1} paddingX={1}>
        <Text color="magenta" bold>◆</Text>
        {flags.length > 0 ? <Text color={LEVEL_COLOR[flags[0]!.level]} bold>⚑ {flags.length}</Text> : null}
        <Text wrap="truncate-end">{parts.join('  │  ')}</Text>
        <Button key="hub" label="Hub" hotkey="h" onPress={() => void openHub($)} />
        {replayButtons}
      </Box>
    )
  })
}

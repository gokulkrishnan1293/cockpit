// The scene at the top: the main session as a supercomputer, its lights
// chasing while Claude works and glowing at rest, in the colour of the
// fullest usage bar. Beside it the model, working or idle with the turn's
// time, and how many subagents run; while a subagent's conversation is in
// the main view, which one, and a way back.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { runningCount, setMainContext, subById } from './agents'
import { supercomputerSvg } from './svg'
import { pal } from './theme'
import { elapsed, modelName, readClock, readFrame, setBusy, stamp, wake } from './tick'

const main = atom({ plugin: 'cockpit', key: 'main' } as const, { isWorking: false }, { shape: 'main-1' })

const LEDS = 5

// Called by the hub's one session.start hook.
export async function mainIsWorking($: EngineInterface) {
  return (await read($, main)).isWorking
}

export async function sceneSessionStart($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    setMainContext(undefined, usage.context.window)
  } catch {
    // the default window stands
  }
  const model = (await read($, main)).model
  if (model) setMainContext(model, undefined)
}

// Called by the hub's one turn.start / turn.complete hooks, main loop only.
export async function sceneTurnStart($: EngineInterface) {
  const t = await $.clock.now()
  await update($, main, m => ({ ...m, isWorking: true, startedAt: t }))
  setBusy('main', true)
  await wake($)
}

export async function sceneTurnComplete($: EngineInterface) {
  const t = await $.clock.now()
  await update($, main, m => ({ ...m, isWorking: false, lastMs: m.startedAt ? t - m.startedAt : m.lastMs }))
  setBusy('main', false)
  await stamp($)
}

export async function sceneModel($: EngineInterface, model: string) {
  if ((await read($, main)).model !== model) await update($, main, m => ({ ...m, model }))
}

/**
 * The header row: the supercomputer and the main session's state. `led` is
 * the colour of the fullest usage bar.
 */
export async function scene($: EngineInterface, e: RenderInput & { component: 'Pane' }, led: string): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Svg = (els as { Svg?: (props: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => RenderElement }).Svg
  const p = pal()
  const m = await read($, main)
  const tick = await readFrame($)
  const now = await readClock($)
  const running = await runningCount($)
  const viewing = await subById($, e.props.view.agentId)

  // Lights: a chase while working, every other one lit at rest.
  const lights = (row: number) =>
    Array.from({ length: LEDS }, (_, i) => {
      const isOn = m.isWorking ? (i + row * 2 + tick) % 3 === 0 : (i + row) % 2 === 0
      return <Text key={`l${row}${i}`} color={isOn ? led : p.track}>●</Text>
    })

  const computer =
    e.surface === 'terminal' || !Svg
      ? (
          <Box flexDirection="column" width={9}>
            <Text color={p.border}>▗▄▄▄▄▄▄▄▖</Text>
            <Text><Text color={p.border}>▐ </Text>{lights(0)}<Text color={p.border}> ▌</Text></Text>
            <Text><Text color={p.border}>▐ </Text>{lights(1)}<Text color={p.border}> ▌</Text></Text>
            <Text>
              <Text color={p.border}>▐ </Text>
              <Text color={m.isWorking && tick % 2 ? p.accent : p.muted}>▬▬▬▬▬</Text>
              <Text color={p.border}> ▌</Text>
            </Text>
            <Text color={p.border}>▝▀▀▀▀▀▀▀▘</Text>
          </Box>
        )
      : <Svg source={supercomputerSvg(p, led, m.isWorking)} alt={m.isWorking ? 'Main session, working' : 'Main session, idle'} width={72} height={64} isInteractive />

  const model = modelName(m.model)
  const state = m.isWorking
    ? `working ${m.startedAt && now ? elapsed(now - m.startedAt) : ''}`.trim()
    : m.lastMs !== undefined
      ? `idle · last turn ${elapsed(m.lastMs)}`
      : 'idle'

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Box flexDirection="row" gap={2}>
        {computer}
        <Box flexDirection="column" justifyContent="center">
          {viewing ? (
            <Text>
              <Text color={p.muted}>Viewing </Text>
              <Text color={p.text} bold>{viewing.type}</Text>
              <Text color={p.muted}> · {viewing.description}</Text>
            </Text>
          ) : (
            <Text color={p.text} bold>Main session</Text>
          )}
          <Text>
            {model ? <Text color={p.text}>{model} · </Text> : null}
            <Text color={m.isWorking ? p.accent : p.muted}>{state}</Text>
          </Text>
          {viewing ? (
            <Button key="back" plain hotkey="m" onPress={() => void $.ui.view({})}>
              <Text color={p.accent}>← Main</Text>
            </Button>
          ) : (
            <Text color={p.muted}>
              {running ? `${running} subagent${running === 1 ? '' : 's'} running` : 'no subagents running'}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// Subagents: every subagent the session starts, as a two-line row in the
// Subagents tab: a small computer, its type and task, model and time, and
// its own context bar with what it is doing now. A row expands to its prompt
// and last few actions, and Open ↗ puts its conversation in the main view.
// A finished one shows ✓ or ✗ for LINGER_MS, then leaves.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, On, RenderElement, RenderInput } from 'claude-code'

import type { Sub } from '../types'
import { short } from './hub'
import { BAR_PX, barSvg, computerSvg } from './svg'
import { pal } from './theme'
import { elapsed, modelName, readClock, readFrame, setBusy, wake } from './tick'

const POLL_MS = 1500
const LINGER_MS = 60_000
const RECENT = 3
// A subagent on another model than the main loop's: its window, assumed.
const DEFAULT_WINDOW = 200_000

const subs = atom({ plugin: 'cockpit', key: 'subs' } as const, [], { shape: 'subs-1' })
const expanded = atom({ plugin: 'cockpit', key: 'expanded' } as const, [], { shape: 'expanded-1' })

// The main loop's model and window, for a subagent on the same model.
let mainModel = ''
let mainWindow = 1_000_000

export function setMainContext(model: string | undefined, window: number | undefined) {
  if (model) mainModel = model
  if (window) mainWindow = window
}

let poller: ReturnType<EngineInterface['clock']['every']> | undefined

function isLive(s: Sub) {
  return s.status === 'running' || s.status === 'waiting' || s.status === 'pending'
}

function windowFor(model: string | undefined) {
  if (model && /\[1m\]|-1m\b/i.test(model)) return 1_000_000
  if (model && mainModel && modelName(model) === modelName(mainModel)) return mainWindow
  return DEFAULT_WINDOW
}

async function patch($: EngineInterface, id: string, fn: (s: Sub) => Sub) {
  await update($, subs, list => list.map(s => (s.id === id ? fn(s) : s)))
}

/** Whether any subagent is still running; the animation clock follows it. */
async function anySubRunning($: EngineInterface) {
  const isRunning = (await read($, subs)).some(isLive)
  setBusy('subs', isRunning)
  return isRunning
}

export async function runningCount($: EngineInterface) {
  return (await read($, subs)).filter(isLive).length
}

export async function subById($: EngineInterface, id: string | undefined) {
  return id ? (await read($, subs)).find(s => s.id === id) : undefined
}

// Statuses from the engine's own list: the one place a finish is certain.
async function poll($: EngineInterface) {
  try {
    const listed = await $.agent.list()
    const t = await $.clock.now()
    await update($, subs, list =>
      list.map(s => {
        if (!isLive(s)) return s
        const info = listed.find(a => a.id === s.id)
        const status = info ? info.status : 'completed'
        if (status === 'running' || status === 'waiting' || status === 'pending') return { ...s, status }
        return { ...s, status, endedAt: t, now: undefined }
      }),
    )
  } catch {
    // the next poll tries again
  }
  if (!(await anySubRunning($))) {
    poller?.cancel()
    poller = undefined
  }
}

function startPolling($: EngineInterface) {
  if (!poller) poller = $.clock.every(POLL_MS, () => void poll($))
}

/** "Read auth.ts", "Bash npm test", "Grep "token"": a tool call in a few words. */
export function describeCall(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const base = (path: string) => path.split('/').filter(Boolean).pop() ?? path
  const detail =
    str(i.file_path) ? base(str(i.file_path))
    : str(i.command) ? str(i.command).split('\n')[0]!
    : str(i.pattern) ? `"${str(i.pattern)}"`
    : str(i.url) ? str(i.url).replace(/^https?:\/\//, '')
    : str(i.query) ? `"${str(i.query)}"`
    : str(i.description)
  return detail ? `${tool} ${detail}`.slice(0, 80) : tool
}

// Called by the hub's one session.start hook: subagents already running
// (a reload mid-run) come back from the engine's list.
export async function agentsSessionStart($: EngineInterface) {
  try {
    const listed = await $.agent.list()
    const known = new Set((await read($, subs)).map(s => s.id))
    const t = await $.clock.now()
    const fresh: Sub[] = listed
      .filter(a => !known.has(a.id) && (a.status === 'running' || a.status === 'waiting' || a.status === 'pending'))
      .map(a => ({ id: a.id, type: a.type, description: a.description, prompt: '', status: a.status, startedAt: t, tools: 0, recent: [], background: false }))
    if (fresh.length) await update($, subs, list => [...list, ...fresh])
    if (await anySubRunning($)) {
      startPolling($)
      await wake($)
    }
  } catch {
    // none listed; spawns bring them
  }
}

// Called by the hub's one tool.call hook for a call inside a subagent.
export async function subToolStart($: EngineInterface, agentId: string, tool: string, input: unknown) {
  await patch($, agentId, s => ({ ...s, now: describeCall(tool, input) }))
}

export async function subToolFinish($: EngineInterface, agentId: string, tool: string, input: unknown, isError: boolean) {
  const line = `${isError ? '✗' : '✓'} ${describeCall(tool, input)}`
  await patch($, agentId, s => ({ ...s, now: undefined, tools: s.tools + 1, recent: [...s.recent, line].slice(-RECENT) }))
}

export function registerAgents(on: On) {
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.deny || !result.agentId) return result
    try {
      const t = await $.clock.now()
      const sub: Sub = {
        id: result.agentId,
        type: e.subagentType,
        description: e.description,
        prompt: e.prompt.slice(0, 400),
        model: result.model,
        status: 'running',
        startedAt: t,
        tools: 0,
        recent: [],
        background: e.background,
      }
      await update($, subs, list => [...list.filter(s => s.id !== sub.id), sub])
      setBusy('subs', true)
      startPolling($)
      await wake($)
    } catch {
      // the row is missing; the spawn goes on
    }
    return result
  })
}

// Called by the hub's one turn.step hook for a step inside a subagent: its
// usage is the subagent's context fill, as the API counted it.
export async function subStep($: EngineInterface, agentId: string, usage: ModelUsage & { model: string }) {
  const tokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens
  await patch($, agentId, s => ({ ...s, tokens, model: s.model ?? usage.model }))
}

/** Leaves out the finished ones past their linger. */
async function shown($: EngineInterface) {
  // The clock now, not the animation's: it stops while nothing runs, and the
  // usage header's minute tick redraws the pane meanwhile.
  const now = await $.clock.now()
  return (await read($, subs)).filter(s => isLive(s) || !s.endedAt || now - s.endedAt < LINGER_MS)
}

function tone(percent: number) {
  const p = pal()
  return percent >= 90 ? p.error : percent >= 75 ? p.warning : p.accent
}

/** The Subagents tab: one row per subagent, `columns` wide. */
export async function subsTab($: EngineInterface, e: RenderInput, columns: number): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  // The remote surfaces' vector leaf; the terminal has none.
  const Svg = (els as { Svg?: (props: { source: string; alt: string; width?: number; height?: number }) => RenderElement }).Svg
  const p = pal()
  const list = await shown($)
  const open = await read($, expanded)
  const now = await readClock($)
  const tick = await readFrame($)
  // A lone subagent opens by itself.
  const isOpen = (s: Sub) => open.includes(s.id) || list.length === 1

  if (!list.length) return <Text color={p.muted}>No subagents running.</Text>

  const toggle = (id: string) => () =>
    void update($, expanded, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
  const jump = (id: string) => () => void $.ui.view({ agentId: id })

  const rows = list.map((s, n) => {
    const state = isLive(s) ? 'running' : s.status === 'completed' ? 'done' : s.status === 'idle' ? 'idle' : 'failed'
    const window = windowFor(s.model)
    const percent = s.tokens ? Math.min(100, Math.round((s.tokens / window) * 100)) : 0
    const time = elapsed((s.endedAt ?? (now || s.startedAt)) - s.startedAt)
    const right =
      state === 'done' ? <Text color={p.success} bold>✓ {time}</Text>
      : state === 'failed' ? <Text color={p.error} bold>✗ {time}</Text>
      : <Text color={p.muted}>{[modelName(s.model), time].filter(Boolean).join(' · ')}</Text>
    const screen =
      state === 'running' ? (tick % 2 ? p.accent : p.muted)
      : state === 'done' ? p.success
      : state === 'failed' ? p.error
      : p.muted

    // The icon: an Svg where the surface draws one, block characters on the terminal.
    const icon =
      e.surface === 'terminal'
        ? (
            <Box flexDirection="column" width={4}>
              <Text color={screen}>▛▀▜</Text>
              <Text color={p.border}>▙▄▟</Text>
            </Box>
          )
        : Svg ? <Svg source={computerSvg(p, state)} alt={`${s.type} ${state}`} width={28} height={26} /> : null

    const barWidth = Math.max(8, Math.floor((columns - 4) * 0.4))
    const filled = s.tokens ? Math.max(1, Math.round((percent / 100) * barWidth)) : 0
    const isExpanded = isOpen(s)
    return (
      <Box key={s.id} flexDirection="row" gap={1} marginBottom={isExpanded ? 1 : 0}>
        {icon}
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Button key={`toggle-${s.id}`} plain hotkey={n < 9 ? String(n + 1) : undefined} onPress={toggle(s.id)}>
              <Text color={p.muted}>{isExpanded ? '▾ ' : '▸ '}</Text>
              <Text color={p.text} bold>{s.type}</Text>
              <Text color={p.muted}> · {s.description}</Text>
            </Button>
            <Box flexDirection="row" gap={2}>
              {right}
              <Button key={`open-${s.id}`} plain onPress={jump(s.id)}>
                <Text color={p.accent}>Open ↗</Text>
              </Button>
            </Box>
          </Box>
          <Box flexDirection="row" gap={1}>
            {Svg ? (
              <Box flexGrow={1}>
                <Svg source={barSvg(p, s.tokens ? percent : 0, tone(percent), false)} alt={`${s.type} context ${s.tokens ? `${percent}%` : 'no reading'}`} height={BAR_PX} />
              </Box>
            ) : (
              <Text>
                <Text color={tone(percent)}>{'█'.repeat(filled)}</Text>
                <Text color={p.track}>{'░'.repeat(barWidth - filled)}</Text>
              </Text>
            )}
            <Text color={percent >= 75 ? tone(percent) : p.text} bold={percent >= 75}>{s.tokens ? `${percent}%` : '—'}</Text>
            <Text color={p.muted}>{s.tokens ? short(s.tokens) : ''}</Text>
            {s.now ? <Text color={p.muted} wrap="truncate-end">  now: {s.now}</Text> : null}
          </Box>
          {isExpanded ? (
            <Box flexDirection="column">
              {s.prompt ? <Text color={p.muted} italic wrap="truncate-end">"{s.prompt.split('\n')[0]}"</Text> : null}
              {s.recent.length || s.now ? (
                <Text wrap="truncate-end">
                  {s.recent.map((r, k) => (
                    <Text key={`r${k}`} color={r.startsWith('✗') ? p.error : p.muted}>{r}   </Text>
                  ))}
                  {s.now ? <Text color={p.accent}>● {s.now}</Text> : null}
                </Text>
              ) : null}
              <Text color={p.muted}>
                {[`${s.tools} tool${s.tools === 1 ? '' : 's'}`, s.tokens ? `${short(s.tokens)} of ${short(window)}` : '', s.background ? 'background' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Box>
    )
  })
  return <Box flexDirection="column">{rows}</Box>
}


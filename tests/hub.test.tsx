import { expect, mock, test } from 'claude-code/testing'

import { weekDays } from '../hooks/pace'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const SCROLL = { offset: 0, bodyRows: 40 }

const pane = (bodyColumns: number) =>
  ({
    plugin: 'cockpit',
    component: 'Pane',
    requestId: 'cockpit',
    surface: 'terminal',
    props: { title: 'cockpit', isFocused: true, bodyColumns, placement: 'dock', scroll: SCROLL, view: {} },
  }) as const

type Setup = { tokens?: number; session?: number; week?: number; theme?: string; noLimits?: boolean; sessionReset?: string; stored?: Record<string, unknown> }

// Everything beneath the plugin stands for the engine.
function engine(on: any, s: Setup = {}) {
  const clock = mock.clock(on, { now: NOW })
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 1_000_000, tokens: s.tokens, percent: s.tokens === undefined ? undefined : Math.round(s.tokens / 10_000) },
      rateLimits: s.noLimits
        ? []
        : [
            { kind: 'five_hour', percentUsed: s.session ?? 8, resetsAt: s.sessionReset ?? '2026-10-25T14:10:00Z' },
            { kind: 'seven_day', percentUsed: s.week ?? 7, resetsAt: '2026-10-29T00:00:00Z' },
          ],
    },
  }))
  on('config.list', () => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: s.theme ?? 'dark', options: ['dark', 'light'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }))
  on('config.set', (_: unknown, e: { value: unknown }) => ({ value: e.value }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.measure', (_: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  const stored: Record<string, unknown> = { ...(s.stored ?? {}) }
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  return { clock, stored }
}

async function start($: any) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)

test('the header shows context, session and week, each as used, and counts both down', async ($, on) => {
  engine(on, { tokens: 44_000, session: 8, week: 7 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  const shown = await texts(ui)
  for (const t of ['CONTEXT', 'SESSION', 'WEEK', '4%', '8%', '7%', '44k of 1M', '⏱ 2:10:00 left']) expect(shown).toContain(t)
  expect(shown.some((t: string) => /^◆ resets \w{3} \d+ \w{3}, \d+:\d\d(am|pm)$/.test(t))).toBe(true)
  expect(shown).toContain('⏱ 3d 12:00:00 left')
  await ui.unmount()
})

test('wide, context and session sit side by side; narrow, they stack', async ($, on) => {
  engine(on, { tokens: 44_000 })
  await start($)
  const wide = await $.ui.mount(pane(80))
  expect((await wide.find({ type: 'Box', key: 'context' }))).toBeDefined()
  const rowOf = async (ui: any) =>
    (await ui.findAll({ type: 'Box' })).find((b: any) => b.children?.length === 2 && b.children.every((c: any) => c.props?.width))?.props.flexDirection
  expect(await rowOf(wide)).toBe('row')
  await wide.unmount()
  const narrow = await $.ui.mount(pane(40))
  expect(await rowOf(narrow)).toBe('column')
  await narrow.unmount()
})

test('a limit past 90% turns red', async ($, on) => {
  engine(on, { tokens: 44_000, session: 93 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  expect((await ui.find({ type: 'Text', text: '93%' }))?.props.color).toBe('#F14C4C')
  await ui.unmount()
})

test('before the first reply each tile says so', async ($, on) => {
  engine(on, { noLimits: true })
  await start($)
  const ui = await $.ui.mount(pane(80))
  expect((await ui.findAll({ type: 'Text', text: 'after the first reply' })).length).toBe(3)
  expect((await ui.findAll({ type: 'Text', text: '—' })).length).toBe(3)
  await ui.unmount()
})

test('a measurement updates the header live', async ($, on) => {
  engine(on, { tokens: 44_000 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  await $.session.measure({
    context: { window: 1_000_000, tokens: 500_000, percent: 50 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-25T14:10:00Z' }],
    changed: ['context', 'rateLimits'],
  } as any)
  const shown = await texts(ui)
  expect(shown).toContain('50%')
  expect(shown).toContain('80%')
  await ui.unmount()
})

test('the colours follow Claude Code\'s light theme, and the text stays readable', async ($, on) => {
  engine(on, { tokens: 44_000, theme: 'light' })
  await start($)
  const ui = await $.ui.mount(pane(80))
  expect((await ui.find({ type: 'Text', text: 'Main session' }))?.props.color).toBe('text')
  expect((await ui.findAll({ type: 'Text', text: 'Subagents' })).find((t: any) => t.text === 'Subagents' && t.props.color)?.props.color).toBe('#005FB8')
  await ui.unmount()
})

const bar = async (ui: any): Promise<{ text: string; color: string }[]> =>
  (await ui.findAll({ type: 'Text' }))
    .filter((t: any) => /^[█░]+$/.test(t.text ?? '') && t.props.color)
    .map((t: any) => ({ text: t.text as string, color: t.props.color as string }))

test('a meter slides up to its figure as the pane opens', async ($, on) => {
  const { clock } = engine(on, { tokens: 500_000, session: 8, week: 7 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  const blue = async () => (await bar(ui)).filter(b => b.color === '#3794FF' && b.text.startsWith('█'))
  await clock.advance(80)
  const early = (await blue())[0]?.text.length ?? 0
  await clock.advance(1000)
  const done = (await blue())[0]!.text.length
  expect(early).toBeLessThan(done)
  // Context at 50% of a 35-column half.
  expect(done).toBe(18)
  await ui.unmount()
})

test('a critical meter\'s tip pulses; others stay still', async ($, on) => {
  const { clock } = engine(on, { tokens: 44_000, session: 95 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  await clock.advance(600)
  const tips = new Set<string>()
  for (let n = 0; n < 3; n++) {
    await clock.advance(500)
    for (const b of await bar(ui)) if (b.text === '█' && (b.color === '#F14C4C' || b.color === '#6E2424')) tips.add(b.color)
  }
  expect([...tips].sort()).toEqual(['#6E2424', '#F14C4C'])
  await ui.unmount()
})

// Subagents: the engine's spawn, list, steps and view, beneath the plugin.
function agents(on: any) {
  const listed: { id: string; type: string; description: string; status: string }[] = []
  const views: unknown[] = []
  on('agent.spawn', (_: unknown, e: any) => {
    listed.push({ id: 'a1', type: e.subagentType, description: e.description, status: 'running' })
    return { agentId: 'a1', model: 'claude-haiku-4-5' }
  })
  on('agent.list', () => ({ value: listed }))
  on('turn.step', async function* (_: unknown, e: any) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'tool_use',
      usage: { input_tokens: 1_000, output_tokens: 1_000, cache_read_input_tokens: 70_000, cache_creation_input_tokens: 4_000, model: 'claude-haiku-4-5' },
    }
  })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('ui.view', (_: unknown, e: unknown) => {
    views.push(e)
    return { value: {} }
  })
  return { listed, views }
}

async function spawn($: any) {
  await $.agent.spawn({ prompt: 'Find where session tokens are checked', description: 'auth flow', subagentType: 'Explore' })
}

async function step($: any, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // chunks pass through
  }
}

test('a subagent becomes a row: type, task, model, its own context and what it does now', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  await start($)
  await spawn($)
  await step($, 'a1')
  const call = $.tool.call({ tool: 'Grep', pattern: 'session token', agentId: 'a1' } as any)
  const ui = await $.ui.mount(pane(90))
  const shown = await texts(ui)
  expect(shown).toContain('Subagents')
  expect(shown).toContain('  1')
  expect(shown).toContain('Explore')
  expect(shown).toContain(' · auth flow')
  expect(shown.some((t: string) => t.startsWith('Haiku 4.5 · '))).toBe(true)
  // 76k of haiku's 200k window.
  expect(shown).toContain('38%')
  expect(shown.some((t: string) => t.includes('76k of 200k'))).toBe(true)
  await call
  await ui.unmount()
})

test('a lone subagent opens by itself, with its prompt and last actions', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  await start($)
  await spawn($)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/auth.ts', agentId: 'a1' } as any)
  const ui = await $.ui.mount(pane(90))
  const shown = await texts(ui)
  expect(shown).toContain('"Find where session tokens are checked"')
  expect(shown.some((t: string) => t.includes('✓ Read auth.ts'))).toBe(true)
  expect(shown.some((t: string) => t.startsWith('1 tool'))).toBe(true)
  await ui.unmount()
})

test('Open ↗ puts the subagent in the main view; ← Main goes back', async ($, on) => {
  engine(on, { tokens: 44_000 })
  const { views } = agents(on)
  await start($)
  await spawn($)
  const ui = await $.ui.mount(pane(90))
  await ui.press({ key: 'open-a1' })
  expect(views).toEqual([{ agentId: 'a1' }])
  await ui.unmount()
  const viewing = await $.ui.mount({ ...pane(90), props: { ...pane(90).props, view: { agentId: 'a1' } } })
  expect(await texts(viewing)).toContain('Viewing ')
  await viewing.press({ key: 'back' })
  expect(views).toEqual([{ agentId: 'a1' }, {}])
  await viewing.unmount()
})

test('a finished subagent shows ✓ with its time, then leaves', async ($, on) => {
  const { clock } = engine(on, { tokens: 44_000 })
  const { listed } = agents(on)
  await start($)
  await spawn($)
  await clock.advance(42_000)
  listed[0]!.status = 'completed'
  await clock.advance(2_000)
  const ui = await $.ui.mount(pane(90))
  expect((await texts(ui)).some((t: string) => /^✓ \d+s$/.test(t))).toBe(true)
  await ui.unmount()
  await clock.advance(120_000)
  const later = await $.ui.mount(pane(90))
  expect(await texts(later)).toContain('No subagents running.')
  await later.unmount()
})

test('the supercomputer says what the main session is doing', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  await start($)
  await step($)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(pane(90))
  let shown = await texts(ui)
  expect(shown).toContain('Main session')
  expect(shown).toContain('Opus 5.5 · ')
  expect(shown.some((t: string) => t.startsWith('working'))).toBe(true)
  expect(shown).toContain('no subagents running')
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
  shown = await texts(ui)
  expect(shown.some((t: string) => t.startsWith('idle · last turn'))).toBe(true)
  await ui.unmount()
})

test('on the desktop every picture, bar and divider is SVG, each bar at a fixed height', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  await start($)
  await spawn($)
  const ui = await $.ui.mount({ ...pane(90), surface: 'desktop' })
  const svgs = await ui.findAll({ type: 'Svg' })
  // The supercomputer; the context, session and week bars; two dividers; a bar
  // per calendar day (7, or 8 where the week opens mid-day here); and the
  // subagent's computer and bar.
  const dayCount = weekDays([], '2026-10-29T00:00:00Z', NOW).length
  expect(svgs).toHaveLength(8 + dayCount)
  expect(svgs.every((s: any) => String(s.props.source).startsWith('<svg'))).toBe(true)
  // Every bar is drawn at a fixed height, so a wide slot doesn't make it thicker.
  const bars = svgs.filter((s: any) => / used$|context /.test(String(s.props.alt)))
  expect(bars).toHaveLength(4)
  expect(bars.every((s: any) => s.props.height === 10)).toBe(true)
  const days = svgs.filter((s: any) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+: /.test(String(s.props.alt)))
  expect(days).toHaveLength(dayCount)
  expect(days.every((s: any) => s.props.height === 6)).toBe(true)
  // No character bars or dividers, which a proportional font can't line up.
  expect((await ui.findAll({ type: 'Text' })).some((t: any) => /[░─]/.test(t.text ?? ''))).toBe(false)
  await ui.unmount()
})

test('the session counts down by the second, and burns red when it would run out', async ($, on) => {
  // 12:00 with the reset at 12:05: the window began 7:05, and 96% is gone.
  const { clock } = engine(on, { tokens: 44_000, session: 96, sessionReset: '2026-10-25T12:05:00Z' })
  await start($)
  const ui = await $.ui.mount(pane(80))
  expect(await texts(ui)).toContain('⏱ 5:00 left')
  await clock.advance(3_000)
  expect(await texts(ui)).toContain('⏱ 4:57 left')
  expect((await ui.find({ type: 'Text', text: '96%' }))?.props.color).toBe('#F14C4C')
  await ui.unmount()
})

test('a session ahead of even pace burns yellow, and says when it would run dry', async ($, on) => {
  // 2h 50m of 5h gone (57%) with 80% used: out in ~42m, before the reset.
  engine(on, { tokens: 44_000, session: 80 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  const shown = await texts(ui)
  expect(shown.some((t: string) => /^empty in ~\d+m$/.test(t))).toBe(true)
  await ui.unmount()
})

test('under even pace the session lasts, and the pace mark sits where the time is', async ($, on) => {
  engine(on, { tokens: 44_000, session: 30 })
  await start($)
  const ui = await $.ui.mount(pane(80))
  expect(await texts(ui)).toContain('lasts to reset ✓')
  // 57% of a 22-column bar.
  const marks = (await ui.findAll({ type: 'Text', text: '┃' })).filter((t: any) => t.text === '┃').length
  expect(marks).toBe(2)
  await ui.unmount()
})

test('the week strip is calendar days: today is today, and the forecast says if it runs out', async ($, on) => {
  engine(on, { tokens: 44_000, week: 60 })
  await start($)
  const ui = await $.ui.mount(pane(110))
  const today = new Date(NOW)
  const label = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()]} ${today.getDate()}`
  const found = (await ui.findAll({ type: 'Text', text: label })).find((t: any) => t.text === label && t.props.color)
  expect(found?.props.color).toBe('#3794FF')
  expect(found?.props.underline).toBe(true)
  // 60% in 3.5 of 7 days: ~120% by the reset, so it runs out before it.
  expect((await texts(ui)).some((t: string) => /^runs out \w{3} ~\d+(am|pm) ✗$/.test(t))).toBe(true)
  await ui.unmount()
})

test('a week that opens mid-day has eight calendar days, the first and last part days', () => {
  // A reset at 2:30pm local, as an account's might be.
  const reset = new Date(2026, 10, 1, 14, 30)
  const now = new Date(2026, 9, 27, 4, 50).getTime()
  const days = weekDays([], reset.toISOString(), now)
  expect(days).toHaveLength(8)
  expect(days[0]!.edge).toBe('from')
  expect(days[7]!.edge).toBe('till')
  expect(days.slice(1, 7).every(d => d.edge === undefined && Math.abs(d.fraction - 1) < 0.05)).toBe(true)
  expect(Math.abs(days.reduce((n, d) => n + d.fraction, 0) - 7) < 0.05).toBe(true)
  // Tuesday 27 at 4:50am is Tuesday 27, not the block that began on Monday afternoon.
  const today = days.find(d => d.isToday)!
  expect([today.weekday, today.date]).toEqual([2, 27])
  // A part day's fair share is in proportion to its hours.
  expect(Math.abs(days[0]!.share - (100 / 7) * days[0]!.fraction) < 1e-9).toBe(true)
})

test('each day fills against its own share, from the readings kept', () => {
  const reset = new Date(2026, 10, 1, 0, 0)
  const start = reset.getTime() - 7 * 86_400_000
  const day = (k: number, h: number) => start + k * 86_400_000 + h * 3_600_000
  const samples = [
    { t: day(0, 20), pct: 10 },
    { t: day(1, 20), pct: 24 },
  ]
  const days = weekDays(samples, reset.toISOString(), day(2, 12))
  expect(days).toHaveLength(7)
  expect(days.map(d => d.used)).toEqual([10, 14, 0, undefined, undefined, undefined, undefined])
  expect(days[2]!.isToday).toBe(true)
})

test('Compact asks for a compaction between turns, and says to wait during one', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  const toasts: string[] = []
  on('ui.toast', (_: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  await start($)
  const ui = await $.ui.mount(pane(80))
  // Between turns it goes to the engine (which a live session answers; the kit has no transcript to compact).
  await ui.press({ key: 'compact' })
  expect(toasts.at(-1)).not.toMatch(/between turns/)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await ui.press({ key: 'compact' })
  expect(toasts.at(-1)).toMatch(/between turns/)
  await ui.unmount()
})

test('on the desktop Subagents is a tab: a chip in the accent colour with its count, on a line', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  await start($)
  await spawn($)
  const ui = await $.ui.mount({ ...pane(90), surface: 'desktop' })
  const chip = (await ui.findAll({ type: 'Box' })).find((b: any) => b.props.borderStyle === 'round' && b.props.borderColor === '#3794FF')
  expect(chip).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'tab-button-subagents' })).toBeDefined()
  expect((await texts(ui)).some((t: string) => t.trim() === '1')).toBe(true)
  await ui.unmount()
})

test('in the terminal Subagents is a folder tab, open at the bottom onto the list', async ($, on) => {
  engine(on, { tokens: 44_000 })
  agents(on)
  await start($)
  await spawn($)
  const ui = await $.ui.mount(pane(90))
  const shown = await texts(ui)
  // "Subagents  1" is 12 wide; with a space each side the tab is 14 across.
  expect(shown).toContain(`╭${'─'.repeat(14)}╮`)
  expect(shown).toContain(`╯${' '.repeat(14)}╰`)
  expect((await ui.findAll({ type: 'Text', text: `╯${' '.repeat(14)}╰` })).find((t: any) => t.text === `╯${' '.repeat(14)}╰`)?.props.color).toBe('#3794FF')
  await ui.unmount()
})

test('when the session resets with no reply since, it shows a fresh window, not 0:00 on the old one', async ($, on) => {
  // 12:00 with the reset at 12:00:05 and 39% used.
  const { clock } = engine(on, { tokens: 44_000, session: 39, sessionReset: '2026-10-25T12:00:05Z' })
  await start($)
  const ui = await $.ui.mount(pane(80))
  expect(await texts(ui)).toContain('⏱ 0:05 left')
  await clock.advance(6_000)
  const shown = await texts(ui)
  expect(shown).toContain('✓ reset · fresh 5h')
  expect(shown).toContain('starts with your next message')
  expect(shown).toContain('0%')
  expect(shown).not.toContain('39%')
  expect(shown.some((t: string) => t.startsWith('⏱ 0:00'))).toBe(false)
  // The bar slides down to empty: no session fill left.
  await clock.advance(1_000)
  expect((await ui.findAll({ type: 'Text', text: '┃' })).filter((t: any) => t.text === '┃')).toHaveLength(1)
  await ui.unmount()
})

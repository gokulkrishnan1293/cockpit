import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-25T12:00:00Z')

const BAND = {
  plugin: 'gokul-hub',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 140, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

const HUB = {
  plugin: 'gokul-hub',
  component: 'Pane',
  requestId: 'gokul-hub',
  props: {
    title: 'gokul-hub',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Stands for the engine: a session whose usage reports these limits.
async function startSession($: any, on: any, session: number, week: number) {
  mock.clock(on, { now: NOW })
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 1_000_000, tokens: 68_200, percent: 7 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: session, resetsAt: '2026-10-25T14:10:00Z' },
        { kind: 'seven_day', percentUsed: week, resetsAt: '2026-10-29T00:00:00Z' },
      ],
    },
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

test('the band shows context, the session limit and the week left', async ($, on) => {
  await startSession($, on, 40, 39)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = await ui.find({ type: 'Text', text: /ctx/ })
  expect(line?.text).toBe('☀ 7% ctx · session 40% · week 61% left')
  await ui.unmount()
})

test('the hub flags a session limit past 75% and a week under 25% left', async ($, on) => {
  await startSession($, on, 83, 80)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...HUB, surface })
    expect((await ui.find({ type: 'Text', text: /worth knowing/ }))?.text).toBe('⚑ 2 worth knowing')
    expect((await ui.find({ type: 'Text', text: /Session limit/ }))?.text).toBe('● Session limit 83% used, resets in 2h 10m')
    expect((await ui.find({ type: 'Text', text: /Weekly limit/ }))?.text).toMatch(/^● Weekly limit: 20% left, resets \w{3} \d+ \w{3}, \d+:\d\d[ap]m$/)
    await ui.unmount()
  }
})

test('the week section says when it resets', async ($, on) => {
  await startSession($, on, 10, 39)
  const ui = await $.ui.mount({ ...HUB, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Nothing to flag/ }))?.text).toBe('✓ Nothing to flag')
  expect((await ui.find({ type: 'Text', text: /resets \w{3} \d+/ }))?.text).toMatch(/resets \w{3} \d+ \w{3}, \d+:\d\d[ap]m \(in 3d 12h\)/)
  await ui.unmount()
})

test('an edit in a turn becomes the replay, shown on the band', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  on('fs.exists', () => ({ value: false }))
  await startSession($, on, 10, 10)
  await $.turn.start({ text: 'rename greet', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', old_string: 'greet()', new_string: 'welcome()' } as any)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /edit/ }))?.text).toContain('▶ 1 edit')
  await ui.unmount()
})

import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const SCROLL = { offset: 0, bodyRows: 40 }

const BAND = {
  plugin: 'gokul-hub',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 140, scroll: SCROLL, view: {} },
} as const

const pane = (requestId: string) =>
  ({
    plugin: 'gokul-hub',
    component: 'Pane',
    requestId,
    props: { title: requestId, isFocused: true, bodyColumns: 56, placement: 'dock', scroll: SCROLL, view: {} },
  }) as const

const toolRow = (tool_use_id: string, tool: string, input: unknown) =>
  ({
    plugin: 'gokul-hub',
    component: 'ToolUse',
    requestId: tool_use_id,
    props: { tool_use_id, tool, input, isRunning: false, isErrored: false, isInterrupted: false },
  }) as const

type Setup = { session?: number; week?: number; theme?: string; options?: string[] }

// Everything beneath the plugin stands for the engine. Hooks go on before
// the first $ call, as a module registers its own in register().
function engine(on: any, s: Setup = {}) {
  const clock = mock.clock(on, { now: NOW })
  const stored: Record<string, unknown> = {}
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_: unknown, e: { key: string }) => {
    delete stored[e.key]
    return { value: undefined }
  })
  const configSets: { key: string; value: unknown }[] = []
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 1_000_000, tokens: 68_200, percent: 7 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: s.session ?? 10, resetsAt: '2026-10-25T14:10:00Z' },
        { kind: 'seven_day', percentUsed: s.week ?? 10, resetsAt: '2026-10-29T00:00:00Z' },
      ],
    },
  }))
  on('config.list', () => ({
    value: [
      {
        key: 'theme',
        label: 'Theme',
        kind: 'choice',
        value: s.theme ?? 'light',
        options: s.options ?? ['auto', 'dark', 'light'],
        provider: { plugin: 'engine', tier: 'core' },
        isLocked: false,
      },
    ],
  }))
  on('config.set', (_: unknown, e: { key: string; value: unknown }) => {
    configSets.push(e)
    return { value: e.value }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.exists', () => ({ value: false }))
  // A decision waits on `sleep 0.25`: here it waits on the mocked clock.
  const measured: { stdout: string } = { stdout: '' }
  on('process.run', async (_: unknown, e: { argv: string[] }) => {
    if (e.argv[0] === 'sleep') {
      await clock.sleep(250)
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    return { value: { ...{ exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }, stdout: measured.stdout } }
  })
  return { clock, measured, configSets, stored }
}

async function start($: any) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

test('the band shows context, the session limit and the week left', async ($, on) => {
  engine(on, { session: 40, week: 39 })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toBe('☀ 7% ctx · session 40% · week 61% left')
  await ui.unmount()
})

test('the Flags tab flags a session past 75% and a week under 25% left', async ($, on) => {
  engine(on, { session: 83, week: 80 })
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('gokul-hub'), surface })
    await ui.press({ key: 'tab-flags' })
    expect((await ui.find({ type: 'Text', text: /worth knowing/ }))?.text).toBe('⚑ 2 worth knowing')
    expect((await ui.find({ type: 'Text', text: /^Session limit/ }))?.text).toBe('Session limit 83% used, resets in 2h 10m')
    expect((await ui.find({ type: 'Text', text: /^Weekly limit/ }))?.text).toMatch(/^Weekly limit: 20% left, resets \w{3} \d+ \w{3}, \d+:\d\d[ap]m$/)
    await ui.unmount()
  }
})

test('the Usage tab says when the week resets', async ($, on) => {
  engine(on, { week: 39 })
  await start($)
  const ui = await $.ui.mount({ ...pane('gokul-hub'), surface: 'terminal' })
  await ui.press({ key: 'tab-usage' })
  expect((await ui.find({ type: 'Text', text: /resets \w{3} \d+/ }))?.text).toMatch(/resets \w{3} \d+ \w{3}, \d+:\d\d[ap]m \(in 3d 12h\)/)
  await ui.unmount()
})

test('a tool call becomes a card in the Activity tab, and a compact row in the conversation', async ($, on) => {
  engine(on)
  const ids: string[] = []
  on('tool.call', (_: unknown, e: { tool_use_id: string }) => {
    ids.push(e.tool_use_id)
    return { result: {}, text: 'ok' }
  })
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'greet()', new_string: 'welcome()' } as any)

  const hub = await $.ui.mount({ ...pane('gokul-hub'), surface: 'terminal' })
  expect((await hub.find({ type: 'Text', text: /^src\/a\.ts$/ }))?.text).toBe('src/a.ts')
  expect(await hub.find({ type: 'Text', text: /^\+ welcome\(\)$/ })).toBeDefined()
  expect(await hub.find({ type: 'Text', text: /^✓/ })).toBeDefined()

  // The hub is showing, so the conversation's row is one compact line.
  const row = await $.ui.mount({ ...toolRow(ids[0]!, 'Edit', { file_path: '/repo/src/a.ts' }), surface: 'terminal' })
  expect(((await row.drawn()) as any).props.borderStyle).toBeUndefined()
  await row.unmount()
  await hub.unmount()
})

test('without the sidebar showing, the conversation draws the card', async ($, on) => {
  engine(on)
  await start($)
  const row = await $.ui.mount({ ...toolRow('t9', 'Bash', { command: 'npm test' }), surface: 'terminal' })
  expect(((await row.drawn()) as any).props.borderStyle).toBe('round')
  expect((await row.find({ type: 'Text', text: /^npm test$/ }))?.text).toBe('npm test')
  await row.unmount()
})

test('a risky command waits on a card, and Proceed lets it run', async ($, on) => {
  const { clock, measured } = engine(on)
  measured.stdout = '3 4096 1\nbuild/a.js\nbuild/b.js\nbuild/c.js\n'
  let ran = false
  on('tool.call', () => {
    ran = true
    return { result: {}, text: 'removed' }
  })
  await start($)
  const call = $.tool.call({ tool: 'Bash', command: 'rm -rf build' } as any)
  await clock.settle()

  const ui = await $.ui.mount({ ...pane('gokul-hub-decide'), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Would delete/ }))?.text).toBe('Would delete 3 files (about 4.0 KB)')
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(2)
  await ui.press({ key: 'proceed' })
  await clock.advance(500)
  const result = (await call) as any
  expect(result.deny).toBeUndefined()
  expect(ran).toBe(true)
  await ui.unmount()
})

test('Cancel refuses the risky command', async ($, on) => {
  const { clock, measured } = engine(on)
  measured.stdout = '0 0 0\n'
  on('tool.call', () => ({ result: {}, text: 'removed' }))
  await start($)
  const call = $.tool.call({ tool: 'Bash', command: 'git reset --hard' } as any)
  await clock.settle()
  const ui = await $.ui.mount({ ...pane('gokul-hub-decide'), surface: 'terminal' })
  await ui.press({ key: 'cancel' })
  await clock.advance(500)
  expect(((await call) as any).deny).toMatch(/the user pressed Cancel/)
  await ui.unmount()
})

test('the VS Code theme is applied when a session starts, and the old one kept', async ($, on) => {
  const { configSets, stored } = engine(on, { theme: 'light', options: ['dark', 'light', 'custom:gokul-hub:vscode-dark'] })
  await start($)
  expect(configSets).toEqual([{ key: 'theme', value: 'custom:gokul-hub:vscode-dark' }])
  expect(stored.previousTheme).toBe('light')
})

test('where the VS Code theme is not offered, the built-in dark stands in', async ($, on) => {
  const { configSets } = engine(on, { theme: 'light' })
  await start($)
  expect(configSets).toEqual([{ key: 'theme', value: 'dark' }])
})

test('an edit in a turn becomes the replay, shown on the band', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  await start($)
  await $.turn.start({ text: 'rename greet', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'greet()', new_string: 'welcome()' } as any)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /edit/ }))?.text).toContain('▶ 1 edit')
  await ui.unmount()
})

test('/hub usage opens the sidebar on the Usage tab', async ($, on) => {
  engine(on, { week: 39 })
  await start($)
  const res = await $.command.run({ command: 'hub', args: 'usage' } as any)
  expect((res as any).text).toBe('opened on usage.')
  const ui = await $.ui.mount({ ...pane('gokul-hub'), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Context & limits/ })).toBeDefined()
  await ui.unmount()
})

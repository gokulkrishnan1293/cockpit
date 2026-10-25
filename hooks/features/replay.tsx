// Replay: records the file edits Claude makes in a turn, then steps through
// them in a pane, one diff at a time. Only watches: it never blocks or
// changes an edit.
// Ported from claude-code-playground's replay-theater mod (Apache-2.0).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { DiffLine, ReplayStep } from '../../types'

const PANE = 'gokul-hub-replay'
const MAX_DIFF_LINES = 12
const MAX_STORED_LINES = 60
const MAX_STEPS = 100
const MAX_LCS_LINES = 400
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])

const steps = atom({ plugin: 'gokul-hub', key: 'replay' } as const, [], { shape: 'replay-1' })
const index = atom({ plugin: 'gokul-hub', key: 'replayIndex' } as const, 0)
const isOpen = atom({ plugin: 'gokul-hub', key: 'replayOpen' } as const, false)

// The edits of the turn under way; they become the replay when it completes.
let pending: ReplayStep[] = []

function relPath(cwd: string, path: unknown) {
  if (typeof path !== 'string' || !path) return '(unknown file)'
  if (cwd && path.startsWith(cwd + '/')) return path.slice(cwd.length + 1)
  return path
}

function splitLines(text: unknown) {
  if (text === undefined || text === null || text === '') return []
  const lines = String(text).split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// A line diff: LCS for small inputs, so unchanged lines show as context;
// all-removed then all-added for large ones.
export function diffLines(oldText: unknown, newText: unknown): DiffLine[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) {
    return [...a.map(t => ({ op: '-' as const, t })), ...b.map(t => ({ op: '+' as const, t }))]
  }
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', t: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ op: '-', t: a[i++]! })
    else out.push({ op: '+', t: b[j++]! })
  }
  while (i < n) out.push({ op: '-', t: a[i++]! })
  while (j < m) out.push({ op: '+', t: b[j++]! })
  return trimContext(out)
}

// Keep one line of context around each change.
function trimContext(lines: DiffLine[]): DiffLine[] {
  if (!lines.some(l => l.op !== ' ')) return lines.slice(0, MAX_DIFF_LINES)
  const changed = (k: number) => lines[k] !== undefined && lines[k]!.op !== ' '
  const out: DiffLine[] = []
  let skipped = false
  lines.forEach((l, k) => {
    if (changed(k) || changed(k - 1) || changed(k + 1)) {
      if (skipped && out.length) out.push({ op: '~', t: '⋯' })
      out.push(l)
      skipped = false
    } else skipped = true
  })
  return out
}

function countChanges(diff: DiffLine[]) {
  let add = 0
  let del = 0
  for (const l of diff) {
    if (l.op === '+') add++
    else if (l.op === '-') del++
  }
  return { add, del }
}

// One tool call → one or more steps. Counts are taken before the diff is
// cut to what is stored.
async function stepsFor($: EngineInterface, e: Record<string, unknown>): Promise<ReplayStep[]> {
  let cwd = ''
  try {
    cwd = await $.session.cwd()
  } catch {
    // keep the full path
  }
  const file = relPath(cwd, e.file_path)
  const cap = (diff: DiffLine[]) => diff.slice(0, MAX_STORED_LINES)
  if (e.tool === 'Edit') {
    return [{ tool: 'Edit', file, diff: cap(diffLines(e.old_string, e.new_string)), note: e.replace_all ? 'replace all' : '' }]
  }
  if (e.tool === 'MultiEdit' && Array.isArray(e.edits)) {
    const edits = e.edits as { old_string?: string; new_string?: string }[]
    return edits.map((ed, k) => ({
      tool: 'MultiEdit',
      file,
      diff: cap(diffLines(ed.old_string, ed.new_string)),
      note: `edit ${k + 1} of ${edits.length}`,
    }))
  }
  if (e.tool === 'Write') {
    let before = ''
    let isNew = true
    try {
      if (typeof e.file_path === 'string' && (await $.fs.exists(e.file_path))) {
        before = await $.fs.read(e.file_path)
        isNew = false
      }
    } catch {
      // unreadable: show it as a new file
    }
    return [{ tool: 'Write', file, diff: cap(diffLines(before, e.content)), note: isNew ? 'new file' : 'rewrite' }]
  }
  return []
}

async function openReplay($: EngineInterface) {
  if ((await read($, steps)).length === 0) return false
  await update($, index, () => 0)
  await update($, isOpen, () => true)
  // A pane takes the keys only while nothing else holds them: the band held
  // them if its button was pressed, so let it redraw first.
  await $.clock.sleep(200)
  const rows = Math.min(MAX_DIFF_LINES + 8, 22)
  await $.ui.open({ id: PANE, title: 'Replay', focus: true, closeOnEscape: true, rows, columns: 58 })
  return true
}

async function replayView($: EngineInterface, e: RenderInput & { component: 'Pane' }) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const list = await read($, steps)
  const total = list.length
  if (!total) return <Text dimColor>No edits to replay.</Text>
  const k = Math.max(0, Math.min(await read($, index), total - 1))
  const step = list[k]!
  const width = Math.max(30, e.props.bodyColumns - 2)
  const { add, del } = countChanges(step.diff)
  const shown = step.diff.slice(0, MAX_DIFF_LINES)

  const rows = shown.map((l, n) => (
    <Text
      key={`d${n}`}
      color={l.op === '+' ? 'green' : l.op === '-' ? 'red' : undefined}
      dimColor={l.op === ' ' || l.op === '~'}
      wrap="truncate-end"
    >
      {`${l.op === '~' ? ' ' : l.op} ${l.t}`.slice(0, width)}
    </Text>
  ))
  if (step.diff.length > MAX_DIFF_LINES) rows.push(<Text dimColor>  … {step.diff.length - MAX_DIFF_LINES} more lines</Text>)
  if (!shown.length) rows.push(<Text dimColor>  (no line changes)</Text>)

  const go = (to: number) => update($, index, () => Math.max(0, Math.min(to, total - 1)))
  const close = async () => {
    await update($, isOpen, () => false)
    await $.ui.close({ id: PANE })
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="magenta">▶ Replay</Text>
        <Text bold>step {k + 1} of {total}</Text>
      </Box>
      <Box flexDirection="row">
        {list.slice(0, 30).map((_, n) => (
          <Text inverse={n === k} color={n === k ? 'cyan' : undefined} dimColor={n !== k}>{` ${n + 1} `}</Text>
        ))}
      </Box>
      <Text bold color="cyan" wrap="truncate-start">{step.file}</Text>
      <Box flexDirection="row" gap={2}>
        <Text dimColor>{step.tool}{step.note ? ` · ${step.note}` : ''}</Text>
        <Text color="green">+{add}</Text>
        <Text color="red">-{del}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>{rows}</Box>
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="prev" label="◀ Prev" hotkey="p" onPress={() => go(k - 1)} />
        <Button key="next" label="Next ▶" hotkey="n" autoFocus onPress={() => go(k + 1)} />
        <Button key="close" label="Close" hotkey="c" role="dismiss" onPress={close} />
      </Box>
    </Box>
  )
}

// Called by the hub's one tool.call hook before an edit runs. Recording must
// never stop the edit.
export async function replayRecord($: EngineInterface, e: Record<string, unknown>) {
  if (!EDIT_TOOLS.has(String(e.tool))) return
  try {
    pending.push(...(await stepsFor($, e)))
  } catch {
    // skip this one
  }
}

// Called by the hub's one ui.close hook.
export async function replayClosed($: EngineInterface, id: string | undefined) {
  if (id === PANE) await update($, isOpen, () => false)
}

// Called by the hub's one session.start hook.
export async function replaySessionStart($: EngineInterface) {
  await $.command.register({ name: 'replay', description: "gokul-hub: step through the last turn's file edits" })
}

// Called by the hub's one turn.complete hook, after a main-loop turn: the
// pending edits become the replay; a turn with no edits keeps the last one.
export async function replayTurnComplete($: EngineInterface) {
  if (!pending.length) return
  const done = pending.slice(-MAX_STEPS)
  pending = []
  await update($, steps, () => done)
  await update($, index, () => 0)
}

export function registerReplay(on: On) {
  on('command.run', { command: 'replay' }, async $ => {
    const opened = await openReplay($)
    const total = (await read($, steps)).length
    return { text: opened ? `Replay: ${total} edits` : 'Replay: no edits in the last turn.' }
  })

  on('turn.start', ($, e, next) => {
    if (!e.agentId) pending = []
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => replayView($, e))
}

export async function replaySummary($: EngineInterface): Promise<string | null> {
  const total = (await read($, steps)).length
  return total ? `▶ ${total} edit${total === 1 ? '' : 's'}` : null
}

export async function replaySection($: EngineInterface, e: RenderInput): Promise<RenderElement | null> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const list = await read($, steps)
  if (!list.length) return <Text dimColor>No edits yet.</Text>
  const files = [...new Set(list.map(s => s.file))]
  return (
    <Box flexDirection="column">
      <Text>{list.length} edit{list.length === 1 ? '' : 's'} in {files.length} file{files.length === 1 ? '' : 's'} last turn</Text>
      {files.slice(0, 5).map(f => <Text dimColor wrap="truncate-start">  {f}</Text>)}
      {files.length > 5 ? <Text dimColor>  + {files.length - 5} more</Text> : null}
      <Button key="open-replay" label="Open replay" onPress={() => void openReplay($)} />
    </Box>
  )
}

export async function replayBandButtons($: EngineInterface, e: RenderInput): Promise<RenderElement[]> {
  const { Button } = $.ui.resolve(e)
  if ((await read($, steps)).length === 0 || (await read($, isOpen))) return []
  return [<Button key="replay" label="Replay" hotkey="r" onPress={() => void openReplay($)} />]
}

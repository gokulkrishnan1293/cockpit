// Activity: every tool call as a card (icon, what it touched, status, time,
// a short preview). With the sidebar on and the hub showing, the cards live in
// the hub's Activity tab and the conversation keeps one compact row per call;
// otherwise the cards are drawn in the conversation itself.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { DiffLine, Op } from '../../types'
import { card, diffRows, textRows } from '../card'
import type { Tone } from '../card'
import { waitingOn } from '../decide'
import { hubIsShowing } from '../hub'
import { pal } from '../theme'
import { browserAvailable, openInBrowser } from './browser'
import { diffLines } from './replay'

const KEEP = 40
const PREVIEW_LINES = 4

const ops = atom({ plugin: 'gokul-hub', key: 'ops' } as const, [], { shape: 'ops-1' })

let isSidebar = true
let cwd = ''
const startedAt = new Map<string, number>()

export function setSidebar(value: unknown) {
  isSidebar = value !== false
}

export async function activitySessionStart($: EngineInterface) {
  try {
    cwd = await $.session.cwd()
  } catch {
    cwd = ''
  }
}

function rel(path: unknown) {
  if (typeof path !== 'string' || !path) return ''
  return cwd && path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path
}

const ICONS: Record<string, string> = {
  Bash: '❯',
  Edit: '✎',
  MultiEdit: '✎',
  Write: '✚',
  Read: '◇',
  NotebookEdit: '✎',
  Grep: '⌕',
  Glob: '⌕',
  WebFetch: '⇣',
  WebSearch: '⌕',
  Agent: '◆',
  Task: '◆',
  TodoWrite: '☐',
  Skill: '✦',
}

/** The icon and the one line that says what a call touches. */
export function describeCall(tool: string, input: unknown): { icon: string; detail: string } {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const icon = ICONS[tool] ?? (tool.startsWith('mcp__') ? '⬡' : '•')
  let detail = ''
  if (tool === 'Bash') detail = s(i.command).split('\n')[0] ?? ''
  else if (['Edit', 'MultiEdit', 'Write', 'Read', 'NotebookEdit'].includes(tool)) detail = rel(i.file_path ?? i.notebook_path)
  else if (tool === 'Grep' || tool === 'Glob') detail = `${s(i.pattern)}${i.path ? `  in ${rel(i.path)}` : ''}`
  else if (tool === 'WebFetch') detail = s(i.url)
  else if (tool === 'WebSearch') detail = s(i.query)
  else if (tool === 'Agent' || tool === 'Task') detail = s(i.description) || s(i.prompt).slice(0, 80)
  else if (tool === 'Skill') detail = s(i.skill)
  else {
    const first = Object.values(i).find(v => typeof v === 'string') as string | undefined
    detail = first ? first.split('\n')[0]! : ''
  }
  return { icon, detail }
}

function diffFor(tool: string, input: unknown): DiffLine[] | undefined {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === 'Edit') return diffLines(i.old_string, i.new_string)
  if (tool === 'MultiEdit' && Array.isArray(i.edits)) {
    return (i.edits as { old_string?: string; new_string?: string }[]).flatMap(ed => diffLines(ed.old_string, ed.new_string))
  }
  if (tool === 'Write' && typeof i.content === 'string') return diffLines('', i.content)
  return undefined
}

/** What a call is about to do, as preview lines (an approval card's body). */
export function previewForInput(tool: string, input: unknown, max: number): string[] {
  const diff = diffFor(tool, input)
  if (diff) return diff.slice(0, max).map(l => `${l.op === '~' ? ' ' : l.op} ${l.t}`)
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === 'Bash') {
    const lines = String(i.command ?? '').split('\n')
    const out = lines.slice(0, max)
    if (typeof i.description === 'string') out.unshift(`# ${i.description}`)
    return out
  }
  return []
}

function previewForResult(tool: string, text: string | undefined, isError: boolean): string[] {
  const lines = String(text ?? '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.length > 0)
  if (isError) return lines.slice(0, 2)
  if (tool === 'Read') return [`${lines.length} lines`]
  if (tool === 'Bash') return lines.slice(-3)
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'TodoWrite'].includes(tool)) return []
  return lines.slice(0, 3)
}

// A local dev server's address in command output: worth a look in the browser.
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s'"<>)]*/

function urlFor(tool: string, input: unknown, text: string | undefined): string | undefined {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === 'WebFetch' && typeof i.url === 'string') return i.url
  if (tool === 'Bash') return String(text ?? '').match(LOCAL_URL)?.[0]?.replace('0.0.0.0', 'localhost')
  return undefined
}

function elapsed(ms: number | undefined) {
  if (ms === undefined) return ''
  return ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`
}

/** Called by the hub's one tool.call hook before the call runs. */
export async function activityStart($: EngineInterface, id: string, tool: string, input: unknown, agentId?: string) {
  const { icon, detail } = describeCall(tool, input)
  startedAt.set(id, await $.clock.now())
  const op: Op = { id, tool, icon, detail, status: 'running', preview: [], diff: diffFor(tool, input)?.slice(0, 30), isSubagent: Boolean(agentId), url: urlFor(tool, input, undefined) }
  await update($, ops, list => [...list.filter(o => o.id !== id), op].slice(-KEEP))
}

/** Called by the hub's one tool.call hook once the call resolved. */
export async function activityFinish($: EngineInterface, id: string, tool: string, input: unknown, result: { deny?: string; isError?: true; text?: string }) {
  const start = startedAt.get(id)
  startedAt.delete(id)
  const ms = start === undefined ? undefined : (await $.clock.now()) - start
  const status: Op['status'] = result.deny !== undefined ? 'denied' : result.isError ? 'error' : 'done'
  const preview = result.deny !== undefined ? [result.deny.split('\n')[0]!] : previewForResult(tool, result.text, Boolean(result.isError))
  const url = urlFor(tool, input, result.text)
  await update($, ops, list => list.map(o => (o.id === id ? { ...o, status, ms, preview: preview.slice(0, PREVIEW_LINES), url: o.url ?? url } : o)))
}

function statusOf(op: Op, waiting: boolean): { text: string; tone: Tone } {
  if (waiting) return { text: '⏸ needs you', tone: 'warning' }
  if (op.status === 'running') return { text: '⟳ running', tone: 'active' }
  if (op.status === 'error') return { text: `✗ failed ${elapsed(op.ms)}`.trim(), tone: 'error' }
  if (op.status === 'denied') return { text: '⊘ denied', tone: 'error' }
  return { text: `✓ ${elapsed(op.ms)}`.trim(), tone: 'success' }
}

function opCard($: EngineInterface, e: RenderInput, op: Op, width: number, waitingId: string | undefined, withButtons = false): RenderElement {
  const els = $.ui.resolve(e)
  const { text, tone } = statusOf(op, waitingId === op.id)
  const rows: RenderElement[] = []
  if (op.diff && op.diff.length && op.status !== 'error' && op.status !== 'denied') rows.push(...diffRows(els, op.diff, PREVIEW_LINES, width))
  else if (op.preview.length) rows.push(...textRows(els, op.preview, width))
  return card(els, {
    key: op.id,
    icon: op.icon,
    title: op.isSubagent ? `${op.tool} · agent` : op.tool,
    status: text,
    tone,
    subtitle: op.detail || undefined,
    rows,
    footer:
      withButtons && op.url && browserAvailable()
        ? [<els.Button key={`open-${op.id}`} label="Open ↗" onPress={() => openInBrowser($, op.url)} />]
        : undefined,
  })
}

/** The hub's Activity tab: the newest calls first, as cards. */
export async function activitySection($: EngineInterface, e: RenderInput, columns: number, waitingId: string | undefined): Promise<RenderElement> {
  const { Box, Text } = $.ui.resolve(e)
  const list = await read($, ops)
  if (!list.length) return <Text color={pal().muted}>No operations yet. They show here as Claude works.</Text>
  const width = Math.max(20, columns - 4)
  return <Box flexDirection="column">{list.slice(-12).reverse().map(op => opCard($, e, op, width, waitingId, true))}</Box>
}

export async function activitySummary($: EngineInterface): Promise<string | null> {
  const running = (await read($, ops)).filter(o => o.status === 'running').length
  return running ? `⟳ ${running} running` : null
}

/** Cards live in the sidebar while it is on and showing. */
function inSidebar() {
  return isSidebar && hubIsShowing()
}

export function registerActivity(on: On) {
  // A tool row in the conversation: compact while the cards are in the
  // sidebar, a card otherwise. ctrl+o (expanded) keeps Claude Code's own row.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const els = $.ui.resolve(e)
    const p = pal()
    const op = (await read($, ops)).find(o => o.id === e.props.tool_use_id)
    const waiting = waitingOn() === e.props.tool_use_id
    const fallback: Op = {
      id: e.props.tool_use_id,
      tool: e.props.tool,
      ...describeCall(e.props.tool, e.props.input),
      status: e.props.isErrored ? 'error' : e.props.isRunning ? 'running' : 'done',
      preview: [],
      diff: diffFor(e.props.tool, e.props.input)?.slice(0, 30),
    }
    const shown = op ?? fallback
    if (inSidebar()) {
      const { text, tone } = statusOf(shown, waiting)
      const { Box, Text } = els
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={p.accent}>{shown.icon}</Text>
          <Text color={p.text} bold>{shown.tool}</Text>
          <Text color={p.muted} wrap="truncate-end">{shown.detail}</Text>
          <Text color={tone === 'success' ? p.success : tone === 'error' ? p.error : tone === 'warning' ? p.warning : p.accent}>{text}</Text>
        </Box>
      )
    }
    const width = Math.max(30, (e.viewport?.columns ?? 100) - 8)
    return opCard($, e, shown, width, waitingOn())
  })

  // The result under a tool row: the card already shows its preview.
  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

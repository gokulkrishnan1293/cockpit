// A decision only the person can make, as a card with buttons: an approval
// (Allow, Deny, More options) or a Blast Radius hold (Proceed, Cancel).
// One at a time, in a focused pane (a tab of the sidebar when it is docked,
// else inline above the prompt), or in the band where no pane can be placed.

import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { card, textRows } from './card'
import { pal } from './theme'

export const DECIDE_PANE = 'gokul-hub-decide'
const HOLD_LIMIT_MS = 10 * 60 * 1000
// Waiting rides on a short `sleep` process: time inside a $ call is free of
// the hook's budget, but a $.clock wait is not.
const POLL_SECONDS = '0.25'

export type Choice = { key: string; label: string; hotkey: string; isDefault?: boolean }

export type Decision = {
  /** The tool call it is about, so its activity card can say it waits. */
  id?: string
  icon: string
  title: string
  subtitle?: string
  summary?: string
  lines: string[]
  more?: number
  note?: string
  tone: 'warning' | 'error'
  choices: Choice[]
}

/** What `decide` resolves to: a choice's key, or why there was none. */
export type Outcome = string | 'timeout' | 'interrupted' | 'error'

type Pending = { decision: Decision; choice: Outcome | null; where: 'pane' | 'band' }

// Live only while its dispatch waits, so a module variable.
let current: Pending | null = null

export function waitingOn(): string | undefined {
  return current?.decision.id
}

export async function decide($: EngineInterface, signal: AbortSignal, decision: Decision): Promise<Outcome> {
  // One at a time: a subagent's call may overlap. `current` is claimed with
  // no await between the check and the claim.
  while (current !== null) {
    if (signal.aborted) return 'interrupted'
    await $.process.run(['sleep', POLL_SECONDS], { timeoutMs: 5000 })
  }
  const mine: Pending = { decision, choice: null, where: 'pane' }
  current = mine
  let isPlaced = false
  try {
    const rows = Math.min(24, 8 + decision.lines.length + (decision.note ? 2 : 0))
    const opened = await $.ui.open({ id: DECIDE_PANE, title: decision.title, focus: true, rows })
    isPlaced = opened.isPlaced
    if (!isPlaced) mine.where = 'band'
    $.ui.invalidate('ui.render')
    const startedAt = await $.clock.now()
    while (mine.choice === null) {
      if (signal.aborted) {
        mine.choice = 'interrupted'
        break
      }
      if ((await $.clock.now()) - startedAt > HOLD_LIMIT_MS) {
        mine.choice = 'timeout'
        break
      }
      await $.process.run(['sleep', POLL_SECONDS], { timeoutMs: 5000 })
    }
  } catch {
    mine.choice = 'error'
  } finally {
    // Close this decision's pane before releasing it, so the next one's pane
    // can't be the one that gets closed.
    try {
      if (isPlaced) await $.ui.close({ id: DECIDE_PANE })
    } catch {
      // already gone
    }
    if (current === mine) current = null
    $.ui.invalidate('ui.render')
  }
  return mine.choice ?? 'error'
}

function draw($: EngineInterface, e: RenderInput, pending: Pending): RenderElement {
  const els = $.ui.resolve(e)
  const { Text, Button } = els
  const d = pending.decision
  const p = pal()
  const width = Math.max(30, ((e.props as { bodyColumns?: number }).bodyColumns ?? 80) - 6)
  const rows = []
  if (d.summary) rows.push(<Text key="sum" color={d.tone === 'error' ? p.error : p.warning} bold wrap="wrap">{d.summary}</Text>)
  rows.push(...textRows(els, d.lines.map(l => `  ${l}`), width))
  if (d.more) rows.push(<Text key="more" color={p.muted}>  + {d.more} more</Text>)
  if (d.note) rows.push(<Text key="note" color={p.muted} italic wrap="wrap">{d.note}</Text>)
  // The buttons answer the decision this card was drawn for, never whichever one waits now.
  const choose = (key: string) => () => {
    if (pending.choice === null) pending.choice = key
  }
  const footer = d.choices.map(c => (
    <Button
      key={c.key}
      label={c.label}
      hotkey={c.hotkey}
      variant={c.key === d.choices[0]!.key ? 'primary' : undefined}
      autoFocus={c.isDefault ? true : undefined}
      onPress={choose(c.key)}
    />
  ))
  footer.push(<Text key="hint" color={p.muted}>Claude is waiting on you</Text>)
  return card(els, { icon: d.icon, title: d.title, status: '⏸ needs you', tone: d.tone, subtitle: d.subtitle, rows, footer })
}

export function drawDecisionPane($: EngineInterface, e: RenderInput): RenderElement | null {
  return current === null ? null : draw($, e, current)
}

export function drawDecisionBand($: EngineInterface, e: RenderInput): RenderElement | null {
  return current === null || current.where !== 'band' ? null : draw($, e, current)
}

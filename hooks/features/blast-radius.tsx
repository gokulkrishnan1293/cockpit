// Blast Radius: holds a risky shell command (rm -rf, git reset --hard,
// git clean, force push, migrations), shows what it would change, and waits
// for Proceed or Cancel. Cancel is the default; no answer in 10 minutes
// refuses it. It reads the command's text, so a command hidden in a script
// or `bash -c "..."` is not caught: a check, not a guarantee.
// Ported from claude-code-playground's blast-radius mod (Apache-2.0); the
// parsing and measuring are in blast-logic.mjs.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { Flag, Hold } from '../../types'
import { classify, measure, resolveDir } from './blast-logic.mjs'

const PANE = 'gokul-hub-blast'
const POLL_SECONDS = '0.25'
const HOLD_LIMIT_MS = 10 * 60 * 1000
const KEEP_HOLDS = 5

type Report = { summary: string; lines: string[]; more?: number; note?: string }
type Risk = { label: string; dir?: string | null }
type Held = {
  command: string
  risk: Risk
  report: Report | null
  decision: Hold['decision'] | null
  where: 'pane' | 'band'
}

// What the held call's pane draws. Live only while its dispatch runs, so a
// module variable; the answered holds are kept in $.state for the hub.
let held: Held | null = null

const holds = atom({ plugin: 'gokul-hub', key: 'holds' } as const, [], { shape: 'holds-1' })

async function record($: EngineInterface, hold: Hold, isNew: boolean) {
  await update($, holds, list =>
    isNew ? [...list, hold].slice(-KEEP_HOLDS) : list.map((h, k) => (k === list.length - 1 ? hold : h)),
  )
}

function paneRows(report: Report) {
  return Math.min(24, 9 + report.lines.length + (report.more ? 1 : 0))
}

function draw($: EngineInterface, e: RenderInput, state: Held) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const report = state.report!
  const list = report.lines.map((line, i) => <Text key={`l${i}`} wrap="truncate-end">  {line}</Text>)
  if (report.more) list.push(<Text dimColor>  + {report.more} more</Text>)
  // The buttons answer the call this pane was drawn for, never whichever one is held now.
  const decide = (choice: 'proceed' | 'cancel') => () => {
    if (state.decision === null) state.decision = choice
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">⚠ Blast Radius · {state.risk.label}</Text>
      <Text wrap="truncate-end">
        <Text dimColor>Command  </Text>
        <Text bold>{state.command}</Text>
      </Text>
      <Text>
        <Text dimColor>Would    </Text>
        <Text color="red" bold>{report.summary}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>{list}</Box>
      {report.note ? <Text dimColor italic wrap="wrap">{report.note}</Text> : null}
      <Box marginTop={1} gap={2}>
        <Button key="proceed" label="Proceed" hotkey="1" plain onPress={decide('proceed')} />
        <Button key="cancel" label="Cancel" hotkey="2" plain autoFocus onPress={decide('cancel')} />
        <Text dimColor>Claude is waiting on your answer</Text>
      </Box>
    </Box>
  )
}

const WHY: Record<string, string> = {
  cancel: 'the user pressed Cancel',
  timeout: 'no answer within 10 minutes',
  interrupted: 'the turn was interrupted',
  error: 'Blast Radius hit an error while holding it',
}

export function registerBlastRadius(on: On) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const risk = classify(String(e.command ?? '')) as Risk | null
    if (risk === null) return next(e)

    // One hold at a time: Bash calls in a turn run in order, but a
    // subagent's may overlap. `held` is claimed with no await between the
    // check and the claim.
    while (held !== null) {
      if (next.signal.aborted) {
        return { deny: 'Blast Radius held this command and did not run it: the turn was interrupted. Do not retry it unless the user asks you to.' }
      }
      await $.process.run(['sleep', POLL_SECONDS], { timeoutMs: 5000 })
    }
    const mine: Held = { command: String(e.command), risk, report: null, decision: null, where: 'pane' }
    held = mine

    let opened = { isPlaced: false }
    let summary = risk.label
    try {
      await record($, { command: mine.command, label: risk.label, summary, decision: 'waiting' }, true)
      // Measure where the command will run: the session folder, moved by
      // any `cd dir &&` or `git -C dir` earlier on the same line.
      const sessionCwd = await $.session.cwd()
      const cwd = risk.dir ? await resolveDir($, sessionCwd, risk.dir) : sessionCwd
      mine.report =
        cwd === null
          ? { summary: `${risk.label} in ${risk.dir}`, lines: [], note: `Couldn't find the folder ${risk.dir}, so I couldn't measure what this would change.` }
          : await measure($, risk, cwd)
      summary = mine.report!.summary
      await record($, { command: mine.command, label: risk.label, summary, decision: 'waiting' }, false)

      opened = await $.ui.open({ id: PANE, title: 'Blast Radius', focus: true, rows: paneRows(mine.report!) })
      if (!opened.isPlaced) mine.where = 'band'
      $.ui.invalidate('ui.render')

      const startedAt = await $.clock.now()
      while (mine.decision === null) {
        if (next.signal.aborted) {
          mine.decision = 'interrupted'
          break
        }
        if ((await $.clock.now()) - startedAt > HOLD_LIMIT_MS) {
          mine.decision = 'timeout'
          break
        }
        await $.process.run(['sleep', POLL_SECONDS], { timeoutMs: 5000 })
      }
    } catch {
      mine.decision = 'error' // anything unexpected refuses the command
    } finally {
      // Close this call's pane before releasing the hold, so the next
      // call's pane can't be the one that gets closed.
      try {
        if (opened.isPlaced) await $.ui.close({ id: PANE })
      } catch {
        // already gone
      }
      if (held === mine) held = null
      $.ui.invalidate('ui.render')
    }

    const decision = mine.decision ?? 'error'
    await record($, { command: mine.command, label: risk.label, summary, decision }, false)
    if (decision === 'proceed') {
      $.ui.toast('Blast Radius: running it')
      return next(e)
    }
    return {
      deny: `Blast Radius held this command and did not run it: ${WHY[decision] ?? 'no answer was recorded'}. It would have: ${summary}. Do not retry it unless the user asks you to.`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Blast Radius hit an error before it could check this command, so it did not run it.' },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e, next) => {
    if (held === null || held.report === null) return next(e)
    return draw($, e, held)
  })
}

export async function blastFlags($: EngineInterface): Promise<Flag[]> {
  const last = (await read($, holds)).at(-1)
  if (last?.decision !== 'waiting') return []
  return [{ id: 'blast-waiting', level: 'alert', text: `Blast Radius is holding \`${last.command}\`: it would ${last.summary}. Answer Proceed or Cancel.` }]
}

export async function blastSection($: EngineInterface, e: RenderInput): Promise<RenderElement | null> {
  const { Box, Text } = $.ui.resolve(e)
  const list = await read($, holds)
  if (!list.length) return <Text dimColor>No risky commands held yet.</Text>
  return (
    <Box flexDirection="column">
      {list
        .slice()
        .reverse()
        .map((h, k) => (
          <Text key={`h${k}`} wrap="truncate-end">
            <Text color={h.decision === 'proceed' ? 'green' : h.decision === 'waiting' ? 'yellow' : 'red'}>
              {h.decision === 'proceed' ? '✓ ran' : h.decision === 'waiting' ? '… waiting' : `✗ ${h.decision}`}
            </Text>
            <Text dimColor> {h.command}</Text>
          </Text>
        ))}
    </Box>
  )
}

// Where no pane could be placed (a narrow terminal), the hold takes the band.
export async function blastBandOverride($: EngineInterface, e: RenderInput): Promise<RenderElement | null> {
  if (held === null || held.report === null || held.where !== 'band') return null
  return draw($, e, held)
}

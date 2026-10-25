// Blast Radius: holds a risky shell command (rm -rf, git reset --hard,
// git clean, force push, migrations), shows what it would change on a
// decision card, and waits for Proceed or Cancel. Cancel is the default; no
// answer in 10 minutes refuses it. It reads the command's text, so a command
// hidden in a script or `bash -c "..."` is not caught: a check, not a guarantee.
// Ported from claude-code-playground's blast-radius mod (Apache-2.0); the
// parsing and measuring are in blast-logic.mjs.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { Flag, Hold } from '../../types'
import { flagRow } from '../card'
import { decide } from '../decide'
import { pal } from '../theme'
import { classify, measure, resolveDir } from './blast-logic.mjs'

const KEEP_HOLDS = 5

type Report = { summary: string; lines: string[]; more?: number; note?: string }
type Risk = { label: string; dir?: string | null }

const holds = atom({ plugin: 'gokul-hub', key: 'holds' } as const, [], { shape: 'holds-1' })

// Calls the person let through here: the approval card doesn't ask again.
const proceeded = new Set<string>()

export function blastProceeded(toolUseId: string | undefined) {
  return toolUseId !== undefined && proceeded.has(toolUseId)
}

async function record($: EngineInterface, hold: Hold, isNew: boolean) {
  await update($, holds, list =>
    isNew ? [...list, hold].slice(-KEEP_HOLDS) : list.map((h, k) => (k === list.length - 1 ? hold : h)),
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

    const command = String(e.command)
    let summary = risk.label
    let outcome: string
    try {
      await record($, { command, label: risk.label, summary, decision: 'waiting' }, true)
      // Measure where the command will run: the session folder, moved by any
      // `cd dir &&` or `git -C dir` earlier on the same line.
      const sessionCwd = await $.session.cwd()
      const cwd = risk.dir ? await resolveDir($, sessionCwd, risk.dir) : sessionCwd
      const report: Report =
        cwd === null
          ? { summary: `${risk.label} in ${risk.dir}`, lines: [], note: `Couldn't find the folder ${risk.dir}, so I couldn't measure what this would change.` }
          : await measure($, risk, cwd)
      summary = report.summary
      await record($, { command, label: risk.label, summary, decision: 'waiting' }, false)
      outcome = await decide($, next.signal, {
        id: e.tool_use_id,
        icon: '⚠',
        title: `Blast Radius · ${risk.label}`,
        subtitle: command,
        summary: `Would ${report.summary}`,
        lines: report.lines,
        more: report.more,
        note: report.note,
        tone: 'error',
        choices: [
          { key: 'proceed', label: 'Proceed', hotkey: '1' },
          { key: 'cancel', label: 'Cancel', hotkey: '2', isDefault: true },
        ],
      })
    } catch {
      outcome = 'error' // anything unexpected refuses the command
    }

    const decision = (['proceed', 'cancel', 'timeout', 'interrupted'].includes(outcome) ? outcome : 'error') as Hold['decision']
    await record($, { command, label: risk.label, summary, decision }, false)
    if (decision === 'proceed') {
      if (e.tool_use_id) proceeded.add(e.tool_use_id)
      $.ui.toast('Blast Radius: running it')
      return next(e)
    }
    return {
      deny: `Blast Radius held this command and did not run it: ${WHY[decision] ?? 'no answer was recorded'}. It would have: ${summary}. Do not retry it unless the user asks you to.`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Blast Radius hit an error before it could check this command, so it did not run it.' },
  )
}

export async function blastFlags($: EngineInterface): Promise<Flag[]> {
  const last = (await read($, holds)).at(-1)
  if (last?.decision !== 'waiting') return []
  return [{ id: 'blast-waiting', level: 'alert', text: `Blast Radius is holding \`${last.command}\`: it would ${last.summary}. Answer Proceed or Cancel.` }]
}

export async function blastSection($: EngineInterface, e: RenderInput): Promise<RenderElement | null> {
  const els = $.ui.resolve(e)
  const { Box, Text } = els
  const p = pal()
  const list = await read($, holds)
  if (!list.length) return <Text color={p.muted}>No risky commands held yet.</Text>
  return (
    <Box flexDirection="column">
      {list
        .slice()
        .reverse()
        .map((h, k) =>
          flagRow(
            els,
            `h${k}`,
            h.decision === 'proceed' ? p.success : h.decision === 'waiting' ? p.warning : p.error,
            `${h.decision === 'proceed' ? '✓ ran' : h.decision === 'waiting' ? '⏸ waiting' : `✗ ${h.decision}`}  ${h.command}`,
          ),
        )}
    </Box>
  )
}

// Approvals: where Claude Code would ask the person whether a tool may run,
// ask on a gokul-hub card instead: Allow (once), Deny, or More options, which
// hands the call back to Claude Code's own prompt with its "always allow"
// choices. A timeout, an interrupt or any error hands it back too, so the
// worst case is the prompt you'd have had anyway.

import type { EngineInterface, On } from 'claude-code'

import { decide } from '../decide'
import { blastProceeded } from './blast-radius'
import { describeCall, previewForInput } from './activity'

// Tools whose ask is the dialog itself: a hook only tightens those.
const OWN_DIALOG = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'])

let isEnabled = true

export function setApprovalCards(value: unknown) {
  isEnabled = value !== false
}

async function askOnCard($: EngineInterface, signal: AbortSignal, tool: string, input: unknown, id: string | undefined) {
  const call = describeCall(tool, input)
  return decide($, signal, {
    id,
    icon: call.icon,
    title: `Allow ${tool}?`,
    subtitle: call.detail,
    lines: previewForInput(tool, input, 8),
    tone: 'warning',
    choices: [
      { key: 'allow', label: 'Allow', hotkey: '1', isDefault: true },
      { key: 'deny', label: 'Deny', hotkey: '2' },
      { key: 'more', label: 'More options…', hotkey: '3' },
    ],
  })
}

export function registerApprovals(on: On) {
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || !isEnabled || e.approver !== 'person' || OWN_DIALOG.has(e.tool)) return verdict
    // Proceeded on the Blast Radius card a moment ago: that was the answer.
    if (blastProceeded(e.tool_use_id)) return { decision: 'allow', reason: 'Proceeded on the Blast Radius card.' }

    const outcome = await askOnCard($, next.signal, e.tool, e.input, e.tool_use_id)
    if (outcome === 'allow') return { decision: 'allow', reason: 'Allowed once on the gokul-hub card.' }
    if (outcome === 'deny') return { decision: 'deny', reason: 'The user denied this on the gokul-hub card.' }
    return verdict // More options, timeout, interrupt, error: Claude Code's own prompt
  }).catch(($, e, next) => next(e))
}

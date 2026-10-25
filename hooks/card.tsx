// The one card every part of the hub draws with: a rounded frame, a header
// of icon, title and status, an optional subtitle, preview rows and a footer.

import type { RenderElement, RenderNode } from 'claude-code'

import type { DiffLine } from '../types'
import { pal } from './theme'

export type Tone = 'normal' | 'active' | 'success' | 'error' | 'warning'

export type CardSpec = {
  key?: string
  icon: string
  title: string
  status?: string
  tone?: Tone
  subtitle?: string
  rows?: RenderNode[]
  footer?: RenderNode[]
  width?: number
}

// Box and Text as every surface's table has them; a card needs nothing else.
type Els = { Box: (props: any) => RenderElement; Text: (props: any) => RenderElement }

export function toneColor(tone: Tone = 'normal') {
  const p = pal()
  return { normal: p.border, active: p.accent, success: p.border, error: p.error, warning: p.warning }[tone]
}

export function statusColor(tone: Tone = 'normal') {
  const p = pal()
  return { normal: p.muted, active: p.accent, success: p.success, error: p.error, warning: p.warning }[tone]
}

export function card({ Box, Text }: Els, spec: CardSpec): RenderElement {
  const p = pal()
  return (
    <Box key={spec.key} flexDirection="column" borderStyle="round" borderColor={toneColor(spec.tone)} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text wrap="truncate-end">
          <Text color={p.accent} bold>{spec.icon} </Text>
          <Text color={p.text} bold>{spec.title}</Text>
        </Text>
        {spec.status ? <Text color={statusColor(spec.tone)} bold={spec.tone !== 'normal'}>{spec.status}</Text> : null}
      </Box>
      {spec.subtitle ? <Text color={p.muted} wrap="truncate-start">{spec.subtitle}</Text> : null}
      {spec.rows && spec.rows.length ? <Box flexDirection="column">{spec.rows}</Box> : null}
      {spec.footer && spec.footer.length ? (
        <Box flexDirection="row" gap={2} marginTop={1}>{spec.footer}</Box>
      ) : null}
    </Box>
  )
}

/** Diff rows for a card: + green, - red, context dim. */
export function diffRows({ Text }: Els, diff: DiffLine[], max: number, width: number): RenderElement[] {
  const p = pal()
  const rows = diff.slice(0, max).map((l, n) => (
    <Text
      key={`d${n}`}
      color={l.op === '+' ? p.added : l.op === '-' ? p.removed : p.muted}
      wrap="truncate-end"
    >
      {`${l.op === '~' ? ' ' : l.op} ${l.t}`.slice(0, width)}
    </Text>
  ))
  if (diff.length > max) rows.push(<Text key="more" color={p.muted}>  … {diff.length - max} more lines</Text>)
  return rows
}

/** Plain preview rows (command output, a file's head), dim. */
export function textRows({ Text }: Els, lines: string[], width: number): RenderElement[] {
  const p = pal()
  return lines.map((l, n) => (
    <Text key={`t${n}`} color={p.muted} wrap="truncate-end">{l.slice(0, width)}</Text>
  ))
}

/** A coloured left bar and text: one flag. */
export function flagRow({ Box, Text }: Els, key: string, color: string | undefined, text: string): RenderElement {
  return (
    <Box key={key} flexDirection="row" gap={1}>
      <Text color={color}>▌</Text>
      <Text wrap="wrap">{text}</Text>
    </Box>
  )
}

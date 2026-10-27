// Usage: the context window's fill and the plan's two rate limits (the
// 5-hour session window and the weekly one), as three tiles side by side, or
// stacked where the pane is narrow. Every figure is "used", so every bar
// fills the same way; a bar slides to a new value and its tip pulses while
// critical.
//
// The two limits are read against their windows' time: a ┃ marks even pace,
// the colour says whether the use burns faster than the time (blue under,
// yellow fast, red out before the reset), the session counts down to its
// reset by the second, and the week forecasts the reset. Under the tiles, the
// week's seven days across the card's width: each day a bar that fills blue
// with its use, full at a fair day's share. Context stays simple, with a
// Compact button.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInput, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { Limit } from '../types'
import { short } from './hub'
import { countdown, FIVE_HOURS, inAbout, pace, SEVEN_DAYS, weekDays } from './pace'
import type { Pace, Sample } from './pace'
import { BAR_PX, barSvg, DAY_BAR_PX, dayBarSvg, dividerSvg } from './svg'
import { pal } from './theme'

// The countdown's tick. A redraw is local: it sends nothing to the model.
const TICK_MS = 1000
// Inner width under which the tiles stack.
const STACK_BELOW = 54
const GAP = 3
// The slide: FRAMES steps of FRAME_MS, easing out. The pulse: every PULSE_MS.
const FRAMES = 12
const FRAME_MS = 40
const PULSE_MS = 500
const CRITICAL = 90
// The week's readings, kept across sessions for the day strip.
const SAMPLES_KEY = 'weekSamples'
const KEEP_SAMPLES = 400

const context = atom({ plugin: 'cockpit', key: 'context' } as const, null, { shape: 'context-1' })
const limits = atom({ plugin: 'cockpit', key: 'limits' } as const, [], { shape: 'limits-1' })
// $.clock.now() at the last refresh, for the countdowns and paces.
const now = atom({ plugin: 'cockpit', key: 'now' } as const, 0)
// What each meter shows now, by metric id: the slide moves it to the figure.
const levels = atom({ plugin: 'cockpit', key: 'levels' } as const, {}, { shape: 'levels-1' })
// The critical tip's phase: bright or dim.
const pulse = atom({ plugin: 'cockpit', key: 'pulse' } as const, false)
const samples = atom({ plugin: 'cockpit', key: 'samples' } as const, [], { shape: 'samples-1' })

let slide: Timer | undefined
let pulser: Timer | undefined

/** Slides each meter from where it is to its figure; pulses while any is critical. */
async function animate($: EngineInterface) {
  const targets: Record<string, number> = {}
  for (const m of await metrics($)) if (m.percent !== undefined) targets[m.id] = clamp(m.percent)
  const from = await read($, levels)
  slide?.cancel()
  let frame = 0
  slide = $.clock.every(FRAME_MS, () => {
    frame++
    const k = 1 - (1 - frame / FRAMES) ** 3
    const next: Record<string, number> = {}
    for (const [id, to] of Object.entries(targets)) next[id] = (from[id] ?? 0) + (to - (from[id] ?? 0)) * k
    void update($, levels, () => next)
    if (frame >= FRAMES) {
      slide?.cancel()
      slide = undefined
    }
  })

  const isCritical = Object.values(targets).some(v => v >= CRITICAL)
  if (isCritical && !pulser) pulser = $.clock.every(PULSE_MS, () => void update($, pulse, v => !v))
  if (!isCritical && pulser) {
    pulser.cancel()
    pulser = undefined
    await update($, pulse, () => false)
  }
}

function clamp(percent: number) {
  return Math.min(100, Math.max(0, Math.round(percent)))
}

async function tickNow($: EngineInterface) {
  const before = await read($, now)
  const t = await $.clock.now()
  await update($, now, () => t)
  // A reset just passed: its bar slides down to the fresh window's 0%.
  const crossed = (await read($, limits)).some(l => {
    const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
    return Number.isFinite(at) && before < at && at <= t
  })
  if (crossed) await animate($)
  return t
}

/** Keeps a reading of the week's use, for the day strip, here and in the store. */
async function keepSample($: EngineInterface, week: Limit | undefined, t: number) {
  if (!week) return
  const reset = week.resetsAt ? Date.parse(week.resetsAt) : NaN
  const start = Number.isFinite(reset) ? reset - SEVEN_DAYS : 0
  const list = await read($, samples)
  const last = list[list.length - 1]
  if (last && last.pct === week.percentUsed && last.t >= start) return
  const next = [...list.filter(s => s.t >= start), { t, pct: week.percentUsed }].slice(-KEEP_SAMPLES)
  await update($, samples, () => next)
  try {
    await $.store.set(SAMPLES_KEY, next)
  } catch {
    // kept for this session; the next reading tries the store again
  }
}

async function record($: EngineInterface, ctx: SessionContextUsage | undefined, windows: SessionRateLimit[] | undefined) {
  if (ctx && ctx.window) {
    await update($, context, () => ({ tokens: ctx.tokens, window: ctx.window, percent: ctx.percent }))
  }
  const t = await tickNow($)
  if (windows) {
    const list = windows.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    await update($, limits, () => list)
    await keepSample($, list.find(l => l.kind === 'seven_day'), t)
  }
  await animate($)
}

// Called by the hub's one session.start hook.
export async function usageSessionStart($: EngineInterface) {
  try {
    const stored = await $.store.get(SAMPLES_KEY)
    if (Array.isArray(stored)) {
      const kept = stored.filter((s): s is Sample => typeof s?.t === 'number' && typeof s?.pct === 'number')
      await update($, samples, () => kept)
    }
  } catch {
    // the strip starts from today's readings
  }
  try {
    const usage = await $.session.usage()
    await record($, usage.context, usage.rateLimits)
  } catch {
    // no reading yet; the first measurement brings one
  }
  // Keep the countdown and paces moving while the session sits idle.
  $.clock.every(TICK_MS, () => void tickNow($))
}

export function registerUsage(on: On) {
  // Every change to the fill or a limit, as it happens.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    try {
      await record(
        $,
        e.changed.includes('context') ? e.context : undefined,
        e.changed.includes('rateLimits') ? e.rateLimits : undefined,
      )
    } catch {
      // the last reading stands
    }
    return result
  })
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thu 29 Oct, 5:30am" in local time. */
function dayDate(at: number) {
  const d = new Date(at)
  const h = d.getHours() % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${h}:${m}${d.getHours() < 12 ? 'am' : 'pm'}`
}

/** "Wed ~3pm" in local time. */
function dayHour(at: number) {
  const d = new Date(at)
  const h = d.getHours() % 12 || 12
  return `${DAYS[d.getDay()]} ~${h}${d.getHours() < 12 ? 'am' : 'pm'}`
}

// isFresh: the window's reset has passed with no reading since. The figures only come with a
// reply, so until the next one the old window would stand: draw a fresh one instead.
type Metric = { id: 'context' | 'session' | 'week'; label: string; percent?: number; limit?: Limit; pace?: Pace; isFresh?: boolean }

async function metrics($: EngineInterface): Promise<Metric[]> {
  const ctx = await read($, context)
  const windows = await read($, limits)
  const t = await read($, now)
  const session = windows.find(l => l.kind === 'five_hour')
  const week = windows.find(l => l.kind === 'seven_day')
  const isPast = (l: Limit | undefined) => {
    const at = l?.resetsAt ? Date.parse(l.resetsAt) : NaN
    return Boolean(t) && Number.isFinite(at) && at <= t
  }
  const limitMetric = (id: 'session' | 'week', label: string, l: Limit | undefined, windowMs: number): Metric =>
    l && isPast(l)
      ? { id, label, percent: 0, limit: l, isFresh: true }
      : { id, label, percent: l?.percentUsed, limit: l, pace: l ? pace(l.percentUsed, l.resetsAt, windowMs, t) : undefined }
  return [
    {
      id: 'context',
      label: 'CONTEXT',
      percent: ctx && ctx.tokens ? Math.round(ctx.percent ?? (ctx.tokens / ctx.window) * 100) : undefined,
    },
    limitMetric('session', 'SESSION', session, FIVE_HOURS),
    limitMetric('week', 'WEEK', week, SEVEN_DAYS),
  ]
}

/** A figure's colour: by how full it is, and for a limit by its pace too. */
function tone(percent: number | undefined, p?: Pace) {
  const c = pal()
  if (percent === undefined) return c.muted
  if (percent >= CRITICAL || p?.state === 'out') return c.error
  if (percent >= 75 || p?.state === 'fast') return c.warning
  return c.accent
}

/** The lights' colour: green while every figure is fine, else the worst bar's. */
export async function ledColor($: EngineInterface) {
  const c = pal()
  const tones = (await metrics($)).map(m => tone(m.percent === undefined ? undefined : clamp(m.percent), m.pace))
  if (tones.includes(c.error)) return c.error
  if (tones.includes(c.warning)) return c.warning
  return c.success
}

/**
 * The header: a rounded card, `columns` wide. Context and session side by
 * side (stacked where narrow), then the week across the card: its bar, its
 * seven days lined up under it, its countdown and reset. Compact waits while
 * `isWorking`: it runs between turns.
 */
export async function usageHeader($: EngineInterface, e: RenderInput, columns: number, isWorking = false): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  // The remote surfaces' vector leaf; the terminal has none.
  const Svg = (els as { Svg?: (props: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => RenderElement }).Svg
  const p = pal()
  const isTerminal = e.surface === 'terminal' || !Svg
  // Drawn only where isTerminal is false, so Svg is there.
  const Vector = Svg!
  const list = await metrics($)
  const shownLevels = await read($, levels)
  const isBright = !(await read($, pulse))
  const t = await read($, now)
  const weekSamples = await read($, samples)
  const ctx = await read($, context)
  // The card's border and padding take 4 columns.
  const inner = Math.max(16, columns - 4)
  const isStacked = inner < STACK_BELOW
  const half = isStacked ? inner : Math.floor((inner - GAP) / 2)

  const bar = (m: Metric, shown: number | undefined, color: string, width: number) => {
    const level = shown === undefined ? 0 : (shownLevels[m.id] ?? 0)
    const filled = Math.min(width, Math.max(level > 0 ? 1 : 0, Math.round((level / 100) * width)))
    // The tip pulses while the figure is critical.
    const tip = shown !== undefined && shown >= CRITICAL && filled > 0 ? 1 : 0
    const mark = m.pace && m.pace.state !== 'early' ? Math.min(width - 1, Math.round(m.pace.elapsed * width)) : -1
    if (e.surface !== 'terminal' && Svg) {
      return (
        <Svg
          source={barSvg(p, level, color, tip === 1, mark >= 0 ? m.pace!.elapsed : undefined)}
          height={BAR_PX}
          alt={shown === undefined ? `${m.label} no reading` : `${m.label} ${shown}% used`}
          isInteractive={tip === 1 ? true : undefined}
        />
      )
    }
    // Cell by cell: the fill, the pulsing tip, the track, and the pace mark over either.
    const cells = Array.from({ length: width }, (_, k) => {
      if (k === mark) return { ch: '┃', color: p.text, isAlone: true }
      if (k < filled - tip) return { ch: '█', color, isAlone: false }
      if (k < filled) return { ch: '█', color: isBright ? color : p.errorDim, isAlone: true }
      return { ch: '░', color: p.track, isAlone: false }
    })
    // Runs of one glyph and colour; the tip and the mark stand alone.
    const runs: { ch: string; color: string; isAlone: boolean }[] = []
    for (const c of cells) {
      const last = runs[runs.length - 1]
      if (last && !last.isAlone && !c.isAlone && last.color === c.color && last.ch[0] === c.ch) last.ch += c.ch
      else runs.push({ ...c })
    }
    return (
      <Text>
        {runs.map((r, k) => (
          <Text key={`b${k}`} color={r.color}>{r.ch}</Text>
        ))}
      </Text>
    )
  }

  const forecast = (m: Metric) => {
    const pc = m.pace
    if (!pc) return <Text color={p.muted}>{m.id === 'session' ? '5-hour window' : '7-day window'}</Text>
    if (pc.state === 'early') return <Text color={p.muted}>pace in a few minutes</Text>
    if (pc.state === 'out') {
      const at = pc.emptyAt ?? t
      const when = at <= t ? 'limit reached' : m.id === 'week' ? `runs out ${dayHour(at)} ✗` : `empty in ${inAbout(at - t)}`
      return <Text color={p.error} bold wrap="truncate-end">{when}</Text>
    }
    if (pc.state === 'fast') {
      return (
        <Text color={p.warning} wrap="truncate-end">
          {m.id === 'week' ? `fast · ~${Math.round(pc.projected ?? 0)}% by reset` : 'burning fast'}
        </Text>
      )
    }
    return (
      <Text color={p.success} wrap="truncate-end">
        {m.id === 'week' ? `on pace · ~${Math.round(pc.projected ?? 0)}% by reset ✓` : 'lasts to reset ✓'}
      </Text>
    )
  }

  const figure = (m: Metric) => {
    const shown = m.percent === undefined ? undefined : clamp(m.percent)
    const color = tone(shown, m.pace)
    return { shown, color, numberColor: shown === undefined ? p.muted : color === p.accent ? p.text : color }
  }

  const head = (m: Metric, right?: RenderElement) => {
    const { shown, numberColor } = figure(m)
    return (
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text color={p.muted} bold>{m.label}</Text>
        <Box flexDirection="row" gap={2}>
          {right ?? null}
          <Text color={numberColor} bold>{shown === undefined ? '—' : `${shown}%`}</Text>
        </Box>
      </Box>
    )
  }

  const countdownText = (m: Metric) => {
    const reset = m.limit?.resetsAt ? Date.parse(m.limit.resetsAt) : NaN
    return Number.isFinite(reset) && t ? `⏱ ${countdown(reset - t)} left` : ''
  }

  const [ctxMetric, sessionMetric, weekMetric] = list as [Metric, Metric, Metric]

  const contextTile = (
    <Box key="context" flexDirection="column" width={isTerminal ? half : undefined} flexGrow={isTerminal ? undefined : 1}>
      {head(ctxMetric)}
      {bar(ctxMetric, figure(ctxMetric).shown, figure(ctxMetric).color, half)}
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text color={p.muted} wrap="truncate-end">
          {ctx && ctx.tokens ? `${short(ctx.tokens)} of ${short(ctx.window)}` : 'after the first reply'}
        </Text>
        <Button
          key="compact"
          plain
          hotkey="c"
          onPress={() =>
            void (isWorking
              ? $.ui.toast('Compact runs between turns: try again when Claude is done.')
              : $.session.compact({}).then(
                  r => $.ui.toast('skip' in r && r.skip ? `Compact skipped: ${r.skip}` : 'Context compacted.'),
                  (error: unknown) => $.ui.toast(`Compact didn't run: ${String((error as Error)?.message ?? error)}`),
                ))
          }
        >
          <Text color={isWorking ? p.muted : p.accent}>{isTerminal ? '⇣ Compact' : 'Compact'}</Text>
        </Button>
      </Box>
    </Box>
  )

  const sessionTile = (
    <Box key="session" flexDirection="column" width={isTerminal ? half : undefined} flexGrow={isTerminal ? undefined : 1}>
      {head(sessionMetric)}
      {bar(sessionMetric, figure(sessionMetric).shown, figure(sessionMetric).color, half)}
      {sessionMetric.isFresh ? (
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text color={p.success}>✓ reset · fresh 5h</Text>
          <Text color={p.muted} wrap="truncate-end">starts with your next message</Text>
        </Box>
      ) : sessionMetric.limit ? (
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text color={p.text}>{countdownText(sessionMetric) || '5-hour window'}</Text>
          {forecast(sessionMetric)}
        </Box>
      ) : (
        <Text color={p.muted}>after the first reply</Text>
      )}
    </Box>
  )

  // The week: its bar over its seven days, each day full at a fair share.
  const week = weekMetric.limit
  const weekReset = week?.resetsAt ? Date.parse(week.resetsAt) : NaN
  // A week past its reset has no days yet: they start with the next reading.
  const days = week && !weekMetric.isFresh ? weekDays(weekSamples, week.resetsAt, t) : []
  // The terminal's day columns: each as wide as its share of the week's hours, so
  // the bar's even-pace mark sits over the day it's in. The bar spans them all.
  const gaps = Math.max(0, days.length - 1)
  const dayWidths = (() => {
    if (!days.length) return []
    const room = Math.max(days.length * 3, inner - gaps)
    const hours = days.reduce((n, d) => n + d.fraction, 0)
    const widths = days.map(d => Math.max(3, Math.round((d.fraction / hours) * room)))
    // Rounding leaves a column or two over or short: the widest day takes it.
    const widest = widths.indexOf(Math.max(...widths))
    widths[widest]! += room - widths.reduce((n, w) => n + w, 0)
    return widths
  })()
  const weekWidth = days.length ? dayWidths.reduce((n, w) => n + w, 0) + gaps : inner
  const dayLabel = (d: (typeof days)[number], room: number) =>
    room >= 6 ? `${DAYS[d.weekday]} ${d.date}` : room >= 3 ? DAYS[d.weekday]! : DAYS[d.weekday]!.slice(0, 1)
  const fillOf = (d: (typeof days)[number]) => (d.used ? Math.min(1, d.used / d.share) : 0)

  const weekPanel = (
    <Box flexDirection="column" width={isTerminal ? weekWidth : undefined}>
      {head(weekMetric, weekMetric.isFresh ? <Text color={p.success}>✓ reset · fresh week</Text> : week ? forecast(weekMetric) : undefined)}
      {isTerminal ? (
        <Box flexDirection="column">
          {bar(weekMetric, figure(weekMetric).shown, figure(weekMetric).color, weekWidth)}
          {days.length ? (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                {days.map((d, k) => (
                  <Box key={`dl${k}`} width={dayWidths[k]}>
                    <Text color={d.isToday ? p.accent : p.muted} bold={d.isToday} underline={d.isToday} wrap="truncate-end">
                      {dayLabel(d, dayWidths[k]!)}
                    </Text>
                  </Box>
                ))}
              </Box>
              <Box flexDirection="row" gap={1}>
                {days.map((d, k) => {
                  const w = dayWidths[k]!
                  const fill = d.used ? Math.max(1, Math.round(fillOf(d) * w)) : 0
                  return (
                    <Text key={`dd${k}`}>
                      <Text color={p.accent}>{'█'.repeat(fill)}</Text>
                      <Text color={p.track}>{'░'.repeat(w - fill)}</Text>
                    </Text>
                  )
                })}
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          {bar(weekMetric, figure(weekMetric).shown, figure(weekMetric).color, weekWidth)}
          {days.length ? (
            // The days as wide as their hours, together as wide as the bar: a label, a bar at a fixed height.
            <Box flexDirection="row" gap={1} marginTop={1}>
              {days.map((d, k) => (
                <Box key={`dc${k}`} flexDirection="column" flexGrow={Math.max(1, Math.round(d.fraction * 100))}>
                  <Text color={d.isToday ? p.accent : p.muted} bold={d.isToday} underline={d.isToday} wrap="truncate-end">
                    {d.fraction >= 0.5 ? `${DAYS[d.weekday]} ${d.date}` : DAYS[d.weekday]}
                  </Text>
                  <Vector
                    source={dayBarSvg(p, fillOf(d), d.used === undefined)}
                    alt={`${DAYS[d.weekday]} ${d.date}: ${d.used === undefined ? 'to come' : `${Math.round(d.used)}% of the week`}`}
                    height={DAY_BAR_PX}
                  />
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      )}
      {weekMetric.isFresh ? (
        <Text color={p.muted}>The new week starts with your next message.</Text>
      ) : week ? (
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text color={p.text}>{countdownText(weekMetric) || '7-day window'}</Text>
          {Number.isFinite(weekReset) ? <Text color={p.muted} wrap="truncate-start">◆ resets {dayDate(weekReset)}</Text> : null}
        </Box>
      ) : (
        <Text color={p.muted}>after the first reply</Text>
      )}
    </Box>
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={p.border} paddingX={1}>
      <Box flexDirection={isStacked ? 'column' : 'row'} gap={isStacked ? 1 : GAP}>
        {contextTile}
        {sessionTile}
      </Box>
      {isTerminal ? <Text color={p.border}>{'─'.repeat(inner)}</Text> : <Box marginY={1}><Vector source={dividerSvg(p)} alt=" " /></Box>}
      {weekPanel}
    </Box>
  )
}

// Weather: the context window's fill and the plan's rate limits (the 5-hour
// session window and the weekly one), from $.session.usage().
// Ported from claude-code-playground's token-weather mod (Apache-2.0).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, RenderInput } from 'claude-code'

import type { Flag, Limit, Reading } from '../../types'
import { short } from '../hub'
import { pal } from '../theme'

const HISTORY = 12
const TICK_MS = 60_000
const BARS = '▁▂▃▄▅▆▇█'

// Forecast bands, by percent of the window used. Single-width symbols, not
// emoji: they line up in every terminal font.
// Colours by palette role, so they read on light and dark backgrounds.
const FORECAST = [
  { upTo: 25, icon: '☀', word: 'Clear', role: 'warning' },
  { upTo: 50, icon: '☁', word: 'Cloudy', role: 'accent2' },
  { upTo: 75, icon: '☂', word: 'Showers', role: 'accent' },
  { upTo: 90, icon: '☇', word: 'Storm', role: 'warning' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', role: 'error' },
] as const

const readings = atom({ plugin: 'gokul-hub', key: 'readings' } as const, [], { shape: 'readings-1' })
const limits = atom({ plugin: 'gokul-hub', key: 'limits' } as const, [], { shape: 'limits-1' })
// $.clock.now() at the last refresh, for the "resets in" countdowns.
const now = atom({ plugin: 'gokul-hub', key: 'now' } as const, 0)

async function takeReading($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits ?? [])
    const t = await $.clock.now()
    await update($, now, () => t)
    const { context } = usage
    if (!context || !context.window) return
    const tokens = context.tokens ?? 0
    const percent = Math.round(context.percent ?? (tokens / context.window) * 100)
    // A reading of 0 comes before any response; drop it once real ones arrive.
    await update($, readings, list =>
      [...list.filter(r => r.tokens > 0), { tokens, window: context.window, percent }].slice(-HISTORY),
    )
  } catch {
    // No reading this time; the last one stands.
  }
}

function forecastFor(percent: number) {
  return FORECAST.find(band => percent < band.upTo) ?? FORECAST[FORECAST.length - 1]!
}

function chart(list: Reading[]) {
  const top = Math.max(...list.map(r => r.tokens), 1)
  return list.map(r => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]).join('')
}

/** "2h 10m" from `clock` until an ISO reset time; "" where unknown. */
function untilReset(resetsAt: string | undefined, clock: number) {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(at) || !clock) return ''
  const mins = Math.max(0, Math.round((at - clock) / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thu 29 Oct, 5:30am" in local time; "" where unknown. */
function resetDate(resetsAt: string | undefined) {
  const d = resetsAt ? new Date(resetsAt) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const h = d.getHours() % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${h}:${m}${d.getHours() < 12 ? 'am' : 'pm'}`
}

async function snapshot($: EngineInterface) {
  const list = await read($, readings)
  const windows: Limit[] = await read($, limits)
  return {
    list,
    last: list[list.length - 1],
    session: windows.find(l => l.kind === 'five_hour'),
    week: windows.find(l => l.kind === 'seven_day'),
    clock: await read($, now),
  }
}

// Called by the hub's one session.start hook.
export async function weatherSessionStart($: EngineInterface) {
  await takeReading($)
  // Keep the countdowns moving while the session sits idle.
  $.clock.every(TICK_MS, () => {
    void $.clock.now().then(t => update($, now, () => t))
  })
}

// Called by the hub's one turn.complete hook, after a main-loop turn.
export async function weatherTurnComplete($: EngineInterface) {
  await takeReading($)
}

export function registerWeather(on: On) {
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits ?? [])
      const t = await $.clock.now()
      await update($, now, () => t)
    }
    return result
  })
}

export async function weatherFlags($: EngineInterface): Promise<Flag[]> {
  const { last, session, week, clock } = await snapshot($)
  const flags: Flag[] = []
  if (last && last.percent >= 75) {
    flags.push({
      id: 'context',
      level: last.percent >= 90 ? 'alert' : 'warn',
      text: `Context ${last.percent}% full (${short(last.tokens)} / ${short(last.window)}): compact or start fresh soon`,
    })
  }
  if (session && session.percentUsed >= 75) {
    const resets = untilReset(session.resetsAt, clock)
    flags.push({
      id: 'session-limit',
      level: session.percentUsed >= 90 ? 'alert' : 'warn',
      text: `Session limit ${Math.round(session.percentUsed)}% used${resets ? `, resets in ${resets}` : ''}`,
    })
  }
  if (week) {
    const left = Math.max(0, Math.round(100 - week.percentUsed))
    if (left <= 25) {
      const when = resetDate(week.resetsAt)
      flags.push({
        id: 'week-limit',
        level: left <= 10 ? 'alert' : 'warn',
        text: `Weekly limit: ${left}% left${when ? `, resets ${when}` : ''}`,
      })
    }
  }
  return flags
}

export async function weatherSummary($: EngineInterface): Promise<string | null> {
  const { last, session, week } = await snapshot($)
  const parts: string[] = []
  if (last) parts.push(`${forecastFor(last.percent).icon} ${last.percent}% ctx`)
  if (session) parts.push(`session ${Math.round(session.percentUsed)}%`)
  if (week) parts.push(`week ${Math.max(0, Math.round(100 - week.percentUsed))}% left`)
  return parts.length ? parts.join(' · ') : null
}

export async function weatherSection($: EngineInterface, e: RenderInput, columns: number): Promise<RenderElement | null> {
  const { Box, Text } = $.ui.resolve(e)
  const { list, last, session, week, clock } = await snapshot($)
  if (!last && !session && !week) return <Text color={pal().muted}>No reading yet: one comes after the first reply.</Text>
  const rows = []
  if (last) {
    const f = forecastFor(last.percent)
    rows.push(
      <Box key="ctx" flexDirection="row" gap={1}>
        <Text color={pal()[f.role]} bold>{f.icon} {f.word}</Text>
        <Text>{last.percent}% of context</Text>
        <Text color={pal().muted}>{short(last.tokens)} / {short(last.window)}</Text>
      </Box>,
    )
    if (list.length > 1 && columns >= 30) {
      rows.push(
        <Box key="chart" flexDirection="row" gap={1}>
          <Text color={pal().muted}>last turns</Text>
          <Text color={pal()[f.role]}>{chart(list)}</Text>
        </Box>,
      )
    }
  }
  if (session) {
    const used = Math.round(session.percentUsed)
    const resets = untilReset(session.resetsAt, clock)
    rows.push(
      <Box key="session" flexDirection="row" gap={1}>
        <Text color={pal().muted}>Session</Text>
        <Text color={used >= 90 ? pal().error : used >= 75 ? pal().warning : pal().text} bold={used >= 75}>{used}% used</Text>
        {resets ? <Text color={pal().muted}>· resets in {resets}</Text> : null}
      </Box>,
    )
  }
  if (week) {
    const left = Math.max(0, Math.round(100 - week.percentUsed))
    const when = resetDate(week.resetsAt)
    const resets = untilReset(week.resetsAt, clock)
    rows.push(
      <Box key="week" flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color={pal().muted}>Week</Text>
          <Text color={left <= 10 ? pal().error : left <= 25 ? pal().warning : pal().text} bold={left <= 25}>{left}% left</Text>
        </Box>
        {when ? <Text color={pal().muted}>  resets {when}{resets ? ` (in ${resets})` : ''}</Text> : null}
      </Box>,
    )
  }
  return <Box flexDirection="column">{rows}</Box>
}

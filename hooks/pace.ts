// Pace: where a limit's use stands against the time its window has run, and
// where that leads by the reset. Plain arithmetic, no engine calls, so the
// tests can hold it to exact figures.

export const FIVE_HOURS = 5 * 3_600_000
export const SEVEN_DAYS = 7 * 86_400_000
const DAY = 86_400_000
// Under this much of a window, too little has happened to call a pace.
const SETTLE_MS = 10 * 60_000
// Ahead of even pace by more than this many points is burning fast.
const SLACK = 5

export type PaceState = 'early' | 'under' | 'fast' | 'out'

export type Pace = {
  state: PaceState
  /** How much of the window has run, 0 to 1. */
  elapsed: number
  /** Where the use would end at the reset, at the pace so far. */
  projected?: number
  /** When it would reach 100%, where it would before the reset. */
  emptyAt?: number
}

export function pace(used: number, resetsAt: string | undefined, windowMs: number, now: number): Pace | undefined {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(reset) || !now) return undefined
  const start = reset - windowMs
  const ran = Math.min(windowMs, Math.max(0, now - start))
  const elapsed = ran / windowMs
  if (used >= 100) return { state: 'out', elapsed, projected: used, emptyAt: now }
  if (ran < SETTLE_MS) return { state: 'early', elapsed }
  const projected = used / elapsed
  if (projected >= 100) return { state: 'out', elapsed, projected, emptyAt: start + ran * (100 / Math.max(used, 0.01)) }
  return { state: used > elapsed * 100 + SLACK ? 'fast' : 'under', elapsed, projected }
}

/** "2:36:12", "9:42" under an hour, "3d 11:59:42" over a day. */
export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const two = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${two(h)}:${two(m)}:${two(s % 60)}`
  if (h > 0) return `${h}:${two(m)}:${two(s % 60)}`
  return `${m}:${two(s % 60)}`
}

/** "~1h 40m" from now to `at`. */
export function inAbout(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  if (d > 0) return `~${d}d ${h}h`
  if (h > 0) return `~${h}h ${String(mins % 60).padStart(2, '0')}m`
  return `~${mins}m`
}

export type Sample = { t: number; pct: number }

export type DaySlot = {
  /** Its weekday in local time: 0 Sunday … 6 Saturday. */
  weekday: number
  /** Its day of the month in local time. */
  date: number
  start: number
  end: number
  /** How much of a whole day it covers: under 1 for the window's first and last. */
  fraction: number
  /** Its fair share of the weekly limit: a day's, scaled by `fraction`. */
  share: number
  /** Points of the weekly limit used in it; absent for a day still to come. */
  used?: number
  /** Whether a reading fell in it: a day cockpit never saw counts what it can't tell apart. */
  isSeen: boolean
  isToday: boolean
  /** The first day opens at the window's start, the last closes at its reset. */
  edge?: 'from' | 'till'
}

/** Local midnight at or before `t`. */
function midnight(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The week's calendar days, midnight to midnight in local time, from the
 * window's start to its reset: eight where the window opens mid-day, the
 * first and last of them part days. Each with what it used.
 */
export function weekDays(samples: Sample[], resetsAt: string | undefined, now: number): DaySlot[] {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(reset)) return []
  const start = reset - SEVEN_DAYS
  // The window opens at 0%: every reading after builds on that.
  const sorted = [{ t: start, pct: 0 }, ...samples.filter(s => s.t >= start && s.t <= now).sort((a, b) => a.t - b.t)]
  const at = (t: number) => {
    let pct = 0
    for (const s of sorted) if (s.t <= t) pct = s.pct
    return pct
  }
  const days: DaySlot[] = []
  for (let day = midnight(start); day < reset; ) {
    // The next local midnight: a day is 23 or 25 hours across a clock change.
    const next = midnight(day + DAY + 3 * 3_600_000)
    const from = Math.max(day, start)
    const to = Math.min(next, reset)
    if (to > from) {
      const fraction = (to - from) / DAY
      const d = new Date(from)
      days.push({
        weekday: d.getDay(),
        date: d.getDate(),
        start: from,
        end: to,
        fraction,
        share: DAILY_SHARE * fraction,
        used: from > now ? undefined : Math.max(0, at(Math.min(to, now)) - at(from)),
        isSeen: sorted.some(s => s.t > from && s.t <= to),
        isToday: from <= now && now < to,
        edge: from > day ? 'from' : to < next ? 'till' : undefined,
      })
    }
    day = next
  }
  return days
}

/** A fair day's share of the weekly limit. */
export const DAILY_SHARE = 100 / 7

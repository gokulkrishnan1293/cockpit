// The animation clock: a frame counter and the time, stepped every FRAME_MS
// while anything moves (the main session working, a subagent running), and
// stopped once nothing does, so an idle cockpit costs nothing.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

const FRAME_MS = 300

const frame = atom({ plugin: 'cockpit', key: 'frame' } as const, 0)
// $.clock.now() at the last frame: the elapsed times read it.
const clock = atom({ plugin: 'cockpit', key: 'clock' } as const, 0)

let ticker: Timer | undefined
// What keeps the clock running: 'main' while a turn runs, 'subs' while a subagent does.
const busy = new Set<string>()

export function setBusy(what: string, isBusy: boolean) {
  if (isBusy) busy.add(what)
  else busy.delete(what)
}

/** The frame number, for what alternates while drawing. */
export async function readFrame($: EngineInterface) {
  return read($, frame)
}

/** The time at the last frame or stamp. */
export async function readClock($: EngineInterface) {
  return read($, clock)
}

export async function stamp($: EngineInterface) {
  const t = await $.clock.now()
  await update($, clock, () => t)
}

/** Starts the frames, if they aren't running; they stop by themselves. */
export async function wake($: EngineInterface) {
  await stamp($)
  if (ticker) return
  ticker = $.clock.every(FRAME_MS, () => void step($))
}

async function step($: EngineInterface) {
  await update($, frame, n => (n + 1) % 1_000_000)
  await stamp($)
  if (!busy.size) {
    ticker?.cancel()
    ticker = undefined
  }
}

/** "3m 20s", "42s", "1h 05m". */
export function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** "claude-opus-5-5" → "Opus 5.5"; anything else as it came. */
export function modelName(id: string | undefined) {
  if (!id) return ''
  const m = /(opus|sonnet|haiku|fable)-(\d+)-(\d+)/i.exec(id) ?? /(opus|sonnet|haiku|fable)-(\d+)/i.exec(id)
  if (!m) return id.replace(/^claude-/, '')
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  return m[3] && m[3].length <= 2 ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

// What the hub and its features share.
//
// The engine reads `on(...)` and `$.noun.method(...)` from source, so a
// feature is a set of top-level functions the hub calls by name, never
// methods on an object. To add a feature, see "Adding a feature" in README.md.

export const HUB_PANE = 'gokul-hub'

// Whether the hub pane is drawn now: set as it draws, cleared as it closes.
let isShowing = false

export function setHubShowing(value: boolean) {
  isShowing = value
}

export function hubIsShowing() {
  return isShowing
}

export const LEVEL_COLOR = { alert: 'red', warn: 'yellow', info: undefined } as const
export const LEVEL_RANK = { alert: 0, warn: 1, info: 2 } as const

/** 68200 → "68.2k", 1000000 → "1M". */
export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

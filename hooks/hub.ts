// What cockpit and its features share.
//
// The engine reads `on(...)` and `$.noun.method(...)` from source, so a
// feature is a set of top-level functions the hub calls by name, never
// methods on an object.

export const COCKPIT_PANE = 'cockpit'

/** 68200 → "68.2k", 1000000 → "1M". */
export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

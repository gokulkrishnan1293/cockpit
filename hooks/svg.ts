// The pictures the desktop app, VS Code and the mobile app draw as SVG (the
// terminal draws the same scenes in block characters). Plain markup built
// from numbers and palette colours: no text from the session goes in.

import type { Palette } from './theme'

const LED_COLS = 5
const LED_ROWS = 2

/** The supercomputer: a rack of lights, chasing while working, glowing at rest. */
export function supercomputerSvg(p: Palette, led: string, isWorking: boolean) {
  const leds: string[] = []
  for (let r = 0; r < LED_ROWS; r++) {
    for (let c = 0; c < LED_COLS; c++) {
      const delay = ((c + r * 2) * 0.12).toFixed(2)
      leds.push(`<circle class="l" style="animation-delay:${delay}s" cx="${18 + c * 9}" cy="${17 + r * 10}" r="3" fill="${led}"/>`)
    }
  }
  const speed = isWorking ? '0.9s' : '3.2s'
  const low = isWorking ? '0.2' : '0.55'
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 64" width="72" height="64">`,
    `<style>@keyframes b{0%,100%{opacity:${low}}50%{opacity:1}}.l{animation:b ${speed} ease-in-out infinite}`,
    `@keyframes s{0%{transform:translateX(-30px)}100%{transform:translateX(30px)}}.s{animation:s 1.6s linear infinite}</style>`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3D41"/><stop offset="1" stop-color="#1F2023"/></linearGradient>`,
    `<clipPath id="c"><rect x="14" y="44" width="44" height="6" rx="2"/></clipPath></defs>`,
    `<rect x="4" y="3" width="64" height="56" rx="7" fill="url(#g)" stroke="${p.border}" stroke-width="1.5"/>`,
    `<rect x="9" y="8" width="54" height="28" rx="3" fill="#141517"/>`,
    leds.join(''),
    `<rect x="14" y="44" width="44" height="6" rx="2" fill="${p.accent}" opacity="0.35"/>`,
    isWorking ? `<g clip-path="url(#c)"><rect class="s" x="22" y="44" width="28" height="6" fill="${p.accent}"/></g>` : '',
    `<rect x="12" y="59" width="10" height="3" rx="1" fill="${p.border}"/><rect x="50" y="59" width="10" height="3" rx="1" fill="${p.border}"/>`,
    `</svg>`,
  ].join('')
}

/** A subagent's computer: a monitor whose screen scrolls while it runs. */
export function computerSvg(p: Palette, status: 'running' | 'done' | 'failed' | 'idle') {
  const screen =
    status === 'running'
      ? `<g class="t"><rect x="7" y="7" width="12" height="1.6" fill="${p.accent}"/><rect x="7" y="10.5" width="8" height="1.6" fill="${p.accent}"/><rect x="7" y="14" width="10" height="1.6" fill="${p.accent}"/></g>`
      : status === 'done'
        ? `<path d="M9 11.5l3 3 6-6" stroke="${p.success}" stroke-width="2" fill="none" stroke-linecap="round"/>`
        : status === 'failed'
          ? `<path d="M10 8l7 7M17 8l-7 7" stroke="${p.error}" stroke-width="2" stroke-linecap="round"/>`
          : `<rect x="7" y="10.5" width="6" height="1.6" fill="${p.muted}"/>`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 26" width="28" height="26">`,
    `<style>@keyframes u{0%{transform:translateY(3px);opacity:.4}100%{transform:translateY(-3px);opacity:1}}.t{animation:u .8s ease-in-out infinite alternate}</style>`,
    `<rect x="3" y="3" width="22" height="16" rx="2.5" fill="#1F2023" stroke="${p.border}" stroke-width="1.5"/>`,
    screen,
    `<rect x="11" y="19" width="6" height="3" fill="${p.border}"/><rect x="7" y="22" width="14" height="2" rx="1" fill="${p.border}"/>`,
    `</svg>`,
  ].join('')
}

/** An energy bar: a rounded track, the fill, a pulsing tip when critical, and the even-pace mark at `mark` (0 to 1). */
export function barSvg(p: Palette, level: number, color: string, isCritical: boolean, mark?: number) {
  const w = Math.max(0, Math.min(200, (level / 100) * 200))
  const tip = isCritical && w > 6
    ? `<rect x="${(w - 6).toFixed(1)}" y="0" width="6" height="10" rx="3" fill="#FFFFFF"><animate attributeName="opacity" values="0;0.6;0" dur="1s" repeatCount="indefinite"/></rect>`
    : ''
  return [
    // Wider than any pane, so it fills the slot's width; the caller fixes its height (BAR_PX).
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 10" width="1000" height="10" preserveAspectRatio="none">`,
    `<rect x="0" y="0" width="200" height="10" rx="5" fill="${p.track}"/>`,
    w > 0 ? `<rect x="0" y="0" width="${w.toFixed(1)}" height="10" rx="5" fill="${color}"/>` : '',
    tip,
    mark !== undefined ? `<rect x="${Math.min(198, mark * 200).toFixed(1)}" y="-1" width="2" height="12" fill="${p.ink}"/>` : '',
    `</svg>`,
  ].join('')
}

/** A bar's height on the desktop, in CSS pixels: the same however wide its slot. */
export const BAR_PX = 10
/** A day's bar under the week, in CSS pixels. */
export const DAY_BAR_PX = 6

/** A hairline across the slot: the desktop's divider, where `─` text falls short. */
export function dividerSvg(p: Palette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1" width="1000" height="1" preserveAspectRatio="none"><rect width="1000" height="1" fill="${p.border}"/></svg>`
}

/** One day's bar under the week: full at a fair day's share; fainter for a day to come. */
export function dayBarSvg(p: Palette, fill: number, isFuture: boolean) {
  const w = Math.max(0, Math.min(1, fill)) * 200
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 10" width="1000" height="10" preserveAspectRatio="none">`,
    `<rect x="0" y="0" width="200" height="10" rx="5" fill="${p.track}" opacity="${isFuture ? 0.5 : 1}"/>`,
    w > 0 ? `<rect x="0" y="0" width="${w.toFixed(1)}" height="10" rx="5" fill="${p.accent}"/>` : '',
    `</svg>`,
  ].join('')
}

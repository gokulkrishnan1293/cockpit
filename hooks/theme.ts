// The look: VS Code Dark Modern / Light Modern colours, picked to match
// Claude Code's own theme. The pane's background is that theme, so the mod
// reads it and never changes it.

import type { EngineInterface } from 'claude-code'

export type Palette = {
  accent: string
  success: string
  warning: string
  error: string
  errorDim: string
  muted: string
  track: string
  border: string
  text: string
  /** The text colour as a hex, for SVG markup, which can't name a theme key. */
  ink: string
}

// Text is the theme's own key: always readable on the pane's background.
const DARK: Palette = {
  accent: '#3794FF',
  success: '#89D185',
  warning: '#CCA700',
  error: '#F14C4C',
  errorDim: '#6E2424',
  muted: '#9D9D9D',
  track: '#5A5A5A',
  border: '#454545',
  text: 'text',
  ink: '#CCCCCC',
}

const LIGHT: Palette = {
  accent: '#005FB8',
  success: '#388A34',
  warning: '#BF8803',
  error: '#E51400',
  errorDim: '#F5B5AE',
  muted: '#6E7681',
  track: '#C8C8C8',
  border: '#C8C8C8',
  text: 'text',
  ink: '#3B3B3B',
}

// Whether Claude Code's theme is a light one, as last read.
let isLightUi = false

export function pal(): Palette {
  return isLightUi ? LIGHT : DARK
}

/** Reads Claude Code's theme so the colours match it. */
export async function readTheme($: EngineInterface) {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  if (row) themeChanged(row.value)
}

/** Called after any change to the theme row, from /theme or /config. */
export function themeChanged(value: unknown) {
  isLightUi = String(value).includes('light')
}

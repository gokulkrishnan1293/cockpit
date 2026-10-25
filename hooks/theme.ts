// The look: VS Code Dark Modern / Light Modern colours for the hub's cards,
// and switching Claude Code's own theme to match (themes/vscode-*.json).

import type { EngineInterface } from 'claude-code'

export type ThemeSetting = 'vscode-dark' | 'vscode-light' | 'off'

export type Palette = {
  accent: string
  accent2: string
  success: string
  error: string
  warning: string
  muted: string
  border: string
  text: string | undefined
  added: string
  removed: string
}

const DARK: Palette = {
  accent: '#3794FF',
  accent2: '#4EC9B0',
  success: '#89D185',
  error: '#F14C4C',
  warning: '#CCA700',
  muted: '#858585',
  border: '#454545',
  text: undefined,
  added: '#89D185',
  removed: '#F14C4C',
}

const LIGHT: Palette = {
  accent: '#005FB8',
  accent2: '#267F99',
  success: '#388A34',
  error: '#E51400',
  warning: '#BF8803',
  muted: '#6E7681',
  border: '#C8C8C8',
  text: undefined,
  added: '#388A34',
  removed: '#E51400',
}

// Theme off: the person's own theme's colours, by key.
const NATIVE: Palette = {
  accent: 'suggestion',
  accent2: 'planMode',
  success: 'success',
  error: 'error',
  warning: 'warning',
  muted: 'inactive',
  border: 'promptBorder',
  text: undefined,
  added: 'success',
  removed: 'error',
}

// Set once per load from the mod's options: a change in /config reloads it.
let setting: ThemeSetting = 'vscode-dark'

export function setThemeSetting(value: unknown) {
  setting = value === 'vscode-light' || value === 'off' ? value : 'vscode-dark'
}

export function themeSetting(): ThemeSetting {
  return setting
}

// Whether the theme in effect is a light one: the pane's background follows
// it, so the accents do too. Read when the theme is applied.
let isLightUi = false

export function pal(): Palette {
  if (setting === 'off') return NATIVE
  return isLightUi ? LIGHT : DARK
}

const PREVIOUS_THEME = 'previousTheme'

/**
 * Puts Claude Code's theme in step with the setting: the mod's VS Code theme
 * where the theme row offers it, else the built-in dark or light. Keeps the
 * person's own theme to put back when the setting is turned off.
 */
export async function applyTheme($: EngineInterface): Promise<string | null> {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  if (!row) return null
  const current = String(row.value)
  isLightUi = current.includes('light')
  if (row.isLocked) return null
  const isOurs = (v: string) => /vscode-(dark|light)$/.test(v)

  if (setting === 'off') {
    const previous = await $.store.get(PREVIOUS_THEME)
    if (typeof previous === 'string' && (isOurs(current) || previous !== current)) {
      await $.config.set({ key: 'theme', value: previous })
      await $.store.delete(PREVIOUS_THEME)
      return previous
    }
    return null
  }

  const want = setting === 'vscode-light' ? 'light' : 'dark'
  const custom = (row.options ?? []).find(o => o.endsWith(`vscode-${want}`))
  const target = custom ?? want
  if (current === target) return null
  if (!isOurs(current) && (await $.store.get(PREVIOUS_THEME)) === undefined) {
    await $.store.set(PREVIOUS_THEME, current)
  }
  const { deny } = await $.config.set({ key: 'theme', value: target })
  if (deny) return null
  isLightUi = want === 'light'
  return target
}

/** What /hub-doctor reports about the theme: the row, and a set and read-back. */
export async function themeReport($: EngineInterface): Promise<string> {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  if (!row) return 'theme row: none'
  const lines = [
    `setting: ${setting}`,
    `theme now: ${String(row.value)}${row.isLocked ? ' (locked)' : ''}`,
    `offered: ${(row.options ?? []).join(', ')}`,
  ]
  if (setting !== 'off') {
    const want = setting === 'vscode-light' ? 'light' : 'dark'
    const target = (row.options ?? []).find(o => o.endsWith(`vscode-${want}`)) ?? want
    const res = await $.config.set({ key: 'theme', value: target })
    const after = (await $.config.list()).find(r => r.key === 'theme')?.value
    lines.push(`set ${target}: ${res.deny ? `refused (${res.deny})` : 'accepted'}; reads back ${String(after)}`)
  }
  return lines.join('\n')
}

/** Flips dark and light through the mod's own /config row; the change reloads it. */
export async function toggleTheme($: EngineInterface) {
  const next = setting === 'vscode-light' ? 'vscode-dark' : 'vscode-light'
  await $.config.set({ key: 'gokul-hub.theme', value: next })
}

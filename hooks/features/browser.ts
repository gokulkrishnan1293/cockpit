// Browser: opens pages in terminal-browser's pane, a tab of the same right
// sidebar, through the API its Claude Code plugin adds to $ (`$.browser`).
// Optional: without terminal-browser (or in a terminal without the kitty
// graphics protocol: Ghostty, kitty, cmux) the button says what to install.
// https://github.com/zenbu-labs/terminal-browser

import type { EngineInterface } from 'claude-code'

import type {} from './browser-api'

const PLUGIN = 'terminal-browser@terminal-browser'
const HOW_TO =
  'Browser needs terminal-browser (brew install terminal-browser, then its Claude Code plugin) and a terminal with kitty graphics, such as Ghostty or kitty.'

// Whether terminal-browser's plugin is enabled, read once per session start.
let hasBrowser = false

export async function browserSessionStart($: EngineInterface) {
  try {
    const enabled = await $.settings.read({ key: 'enabledPlugins' })
    hasBrowser = Boolean(enabled && typeof enabled === 'object' && (enabled as Record<string, unknown>)[PLUGIN] === true)
  } catch {
    hasBrowser = false
  }
}

export function browserAvailable() {
  return hasBrowser
}

export async function openInBrowser($: EngineInterface, url?: string) {
  if (!hasBrowser) {
    $.ui.toast(HOW_TO)
    return
  }
  try {
    const result = await $.browser!.open(url ? { url } : {})
    if (!result.ok) $.ui.toast(`Browser: ${result.error}`)
  } catch {
    $.ui.toast(HOW_TO)
  }
}

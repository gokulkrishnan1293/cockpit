// terminal-browser's API (github.com/zenbu-labs/terminal-browser, MIT), as its
// Claude Code plugin adds it to $. Present only where that plugin is
// installed, so optional here and every call is guarded (browser.ts).

export type BrowserOpenResult = { ok: true; url: string } | { ok: false; error: string }

export type OptionalBrowser = {
  open: (input: { url?: string }) => Promise<BrowserOpenResult>
  close: (input?: Record<string, never>) => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    browser?: OptionalBrowser
  }
}

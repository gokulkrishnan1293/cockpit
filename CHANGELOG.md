# Changelog

## 0.2.0

- **Sidebar with tabs**: Activity, Flags and Usage, docked on the right in the fullscreen layout; `/hub <tab>` opens it on a tab.
- **Operation cards**: every tool call as a card with icon, target, status, timing and a short preview (diff, output, line count). With the sidebar on, the conversation keeps one compact row per call; off, it draws the cards itself.
- **Approval cards**: Allow / Deny / More options on a card wherever Claude Code would ask; anything unexpected hands back to Claude Code's own prompt.
- **Blast Radius on the same decision card**, with Proceed / Cancel; a command proceeded there isn't asked about again.
- **VS Code theme**: Dark Modern / Light Modern palettes for the cards, Claude Code's theme switched to match at session start (previous theme kept), `/hub-theme` and a sidebar button to switch, `themes/vscode-*.json`.
- **Settings in `/config`**: Theme, Sidebar, Approval cards.
- **Browser**: optional terminal-browser integration (⧉ Browser, Open ↗ on cards with a page).
- **`/hub-doctor`** for troubleshooting.
- Fix: decisions wait on a `sleep` process, not `$.clock`, so a hold no longer runs out the hook's 10-second budget.
- Docs: screenshots, walkthrough videos and VHS recording scripts.

## 0.1.0

- One mod hosting Weather (context and plan limits), Blast Radius and Replay, with a hub pane and one band above the prompt.

# Changelog

## 0.9.8

- **No edge times under the days**: the `from 2:30pm` / `till 2:30pm` line is gone; the reset line already says when the week turns over, and the part days show it by their width.

## 0.9.7

- **Calendar days**: the week strip's days run midnight to midnight in local time, so today is today. A week that opens mid-day has eight, the first and last part days marked `from 2:30pm` / `till 2:30pm`, each with a fair share in proportion to its hours. Labels carry the date (`Tue 27`), and each day is as wide as its hours so the pace mark sits over the day it's in.

## 0.9.6

- **Resets roll over**: once a limit's reset time passes with no reply since (the figures only come with replies), cockpit shows a fresh window instead of the old one stuck at `0:00`: 0%, the bar sliding to empty, "✓ reset · fresh 5h · starts with your next message" (and "fresh week" for the week). The next reply brings the new window's figures.

## 0.9.5

- **Terminal tab**: Subagents is a folder tab in box-drawing characters, the active one open at the bottom onto the list, the rule running on to the pane's edge.

## 0.9.4

- **Desktop tab bar**: Subagents is drawn as a tab on desktop, VS Code and mobile: a rounded chip in the accent colour with the running count, sitting on a line across the pane. The bar is a list, ready for the next features as more tabs.

## 0.9.3

- **Desktop bars at one thickness**: every bar has a fixed 10px height and stretches only in width, so the week's full-width bar is as thick as the half-width ones. The week's days are seven equal columns as wide as its bar, each a text label over a 6px bar.

## 0.9.2

- **Desktop week bar**: the week's bar is the same bar as context and session, so it's as thick; its days are a second drawing on the same 200-unit scale, so they still line up under it, with labels at text size.
- **Desktop row ends**: context and session stretch to the card on desktop instead of taking terminal column widths, so every row ends at the same edge.

## 0.9.1

- **Desktop alignment**: the week's bar, pace mark, days and their bars are one SVG on the desktop app, VS Code and mobile, so they share one ruler and fill the card; dividers are real lines there and subagent bars are SVG. The terminal is unchanged.

## 0.9.0

- **Two columns, then the week**: context and session side by side with longer bars; the week below across the card, its bar spanning its seven days so the pace mark sits over today.
- **Week countdown**: `⏱ 3d 11:59:42 left` by the second, with the reset's date and time.

## 0.8.0

- **Countdown by the second**: `⏱ 2:36:12 left`. Redraws are local and cost no tokens.
- **Week strip across the card**: the seven days run the full width under the tiles, each day's bar blue with its use and full at a fair day's share, grey for the rest.
- **One close button**: cockpit's own ✕ is gone; the pane's × closes it.

## 0.7.0

- **Session**: a live countdown to the reset (seconds in the last ten minutes), a ┃ mark at even pace, and a burn colour: blue under pace, yellow burning fast, red when it would run out before the reset, with "empty in ~1h 40m" or "lasts to reset ✓".
- **Week**: a day strip from the window's start, each day's use against a fair share (blue under, yellow met, red over), the pace mark, and a forecast: "on pace · ~68% by reset ✓" or "runs out Wed ~3pm ✗". Readings are kept across sessions.
- **Compact** button under context (`c`), between turns.
- **✕** closes the pane (`x`).

## 0.6.0

- **Supercomputer**: the main session at the top, its lights chasing while Claude works and coloured by the fullest usage bar; the model, working or idle, and the subagent count beside it. The title is gone.
- **Subagents tab**: a two-line row per subagent with type, task, model, time, its own context bar and what it's doing now; rows expand to the prompt and last actions; **Open ↗** jumps into its conversation and **← Main** comes back.
- **SVG on desktop, VS Code and mobile**: the supercomputer, the computers and the energy bars are animated SVG there.

## 0.5.0

- **Renamed to cockpit** (was gokul-hub): `/cockpit` opens the pane.
- **Energy bars**: solid full-height bars on a shaded track.
- **Animations**: a bar slides to its new value when a figure changes, and the tip of a bar at 90% or more pulses.

## 0.4.0

- **Back to one feature**: the hub is rebuilt one feature at a time. Activity, Flags, Blast Radius, Replay, Browser and the line above the prompt are removed for now.
- **Usage as the header**: context, session and week as three tiles with meters, all counted as used, yellow at 75% and red at 90%; they stack where the pane is narrow and update live.
- **No theme switcher**: the colours follow Claude Code's theme; the Theme and other settings are gone.

## 0.3.0

- **Theme**: the cards follow Claude Code's own theme instead of switching it at session start; text uses the theme's text colour, so the title is readable on either background. `t` and `/hub-theme` flip Claude Code's theme. Setting is now `vscode` or `off`.
- **Approval cards removed**: Claude Code's own permission prompt is back. Blast Radius still holds risky commands.

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
- Docs: screenshots, walkthrough videos, VHS recording scripts, and a 21s launch video (/brag-slim, cinematic) with its sources.

## 0.1.0

- One mod hosting Weather (context and plan limits), Blast Radius and Replay, with a hub pane and one band above the prompt.

# cockpit

A Claude Code mod: a pane of instruments on the right of the terminal. At the top the main session is a supercomputer. Under it, energy bars for context and plan limits. Then the **Subagents** tab, where each subagent is a small computer with its own context bar.

```
▗▄▄▄▄▄▄▄▖
▐ ●●●●● ▌  Main session
▐ ●●●●● ▌  Opus 5.5 · working 3m 20s
▐ ▬▬▬▬▬ ▌  2 subagents running
▝▀▀▀▀▀▀▀▘
╭──────────────────────────────────────────────────────────────────────────────╮
│ CONTEXT                          44%   SESSION                           62% │
│ ███████████████░░░░░░░░░░░░░░░░░░░░   ███████████████████████┃░░░░░░░░░░░░ │
│ 440k of 1M              ⇣ Compact      ⏱ 2:36:12 left         burning fast │
│ ──────────────────────────────────────────────────────────────────────────── │
│ WEEK                                             runs out Tue ~3pm ✗    60% │
│ ███████████████████████████████████████████┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ Thu        Fri        Sat        Sun        Mon        Tue        Wed       │
│ █████████░ ██████████ ██████████ ████░░░░░░ ░░░░░░░░░░ ░░░░░░░░░░ ░░░░░░░░░ │
│ ⏱ 3d 11:59:42 left                          ◆ resets Thu 29 Oct, 5:30am     │
╰──────────────────────────────────────────────────────────────────────────────╯
Subagents 2
────────────────────────────────────────────────────────────────
▛▀▜ ▸ Explore · auth flow             Haiku 4.5 · 1m 05s  Open ↗
▙▄▟ ███████░░░░░░░░░░░░░ 38% 76k   now: Grep "session token"
```

In the desktop app, VS Code and the mobile app, the supercomputer, the computers and the bars are drawn as animated SVG.

## The supercomputer

The main session. Its lights chase while Claude works on a turn and rest when idle. They're green while every usage figure is fine, and take the colour of the fullest bar from 75%. Beside it: the model, working with the turn's time or idle with the last turn's, and how many subagents are running.

## Usage

- **Context**: how full the context window is, in tokens. **⇣ Compact** (`c`) compacts the conversation between turns.
- **Session**: the plan's 5-hour limit. `⏱ 2:36:12 left` counts down to the reset by the second. A redraw is local, so the ticking costs no tokens.
- **Week**: the weekly limit, across the card under the other two: its bar, its seven days lined up under it (so the pace mark sits over today), `⏱ 3d 11:59:42 left` counting down by the second, and the reset's date and time. The days are calendar days in your time zone (`Tue 27`); a week that opens mid-day has eight, the first and last part days, narrower to match their hours. Each day's bar fills blue with that day's use and is full at its fair share of the week (about 14% a day, less for a part day); grey is what's left. Today's name is underlined.

Every figure counts **used**, so every bar fills the same way. On the two limits a **┃** marks even pace: where you'd be if you spread the limit evenly over its window. The colour follows the pace: blue on or under it, yellow when burning faster than the time, red when you'd run out before the reset (or past 90%). Under each, the forecast: `lasts to reset ✓`, `burning fast` or `empty in ~1h 40m` for the session; `on pace · ~68% by reset ✓` or `runs out Wed ~3pm ✗` for the week. The pace needs ten minutes of the window first.

When a figure changes, its bar slides to the new value; at 90% or more, the tip of its bar pulses. Once a limit's reset time passes with no reply since (the figures only come with replies), its bar slides to empty and reads `✓ reset · fresh 5h` (or `fresh week`) until the next reply brings the new window's figures. Plan limits show on a Claude subscription after the session's first reply. The week's readings are kept across sessions, so the strip fills in as you use Claude Code; its figures come from your account, so they include claude.ai and your other devices. Context and session sit side by side; where the pane is narrow, they stack.

## Subagents

Subagents sits under the card as a tab with its running count: a folder tab drawn in box-drawing characters in the terminal, a rounded chip on the desktop app, VS Code and mobile. One row per subagent, two lines each:

- its type and task, model and running time, and **Open ↗**;
- its own context bar (its tokens against its model's window, estimated), and the tool it's running now.

Press a row (or `1`–`9` while the pane has the keyboard) to expand it: the start of its prompt, its last three actions, how many tools it used and whether it runs in the background. A lone subagent is expanded already. A finished subagent shows ✓ or ✗ with its time for a minute, then leaves.

**Open ↗** puts that subagent's conversation in the main view, as the tasks list does; the prompt then talks to it. The header says which one you're viewing, with **← Main** (`m`) to go back. Stopping a subagent stays with Claude Code's tasks list.

## Colours

VS Code's Dark Modern or Light Modern, picked to match Claude Code's own theme. The pane's background is that theme, so if the pane looks light in a dark terminal, run `/theme` and pick Dark.

## Install

Needs Claude Code **2.1.287 or later** (built and tested on 2.1.311).

```text
/plugin install cockpit --marketplace gokulkrishnan1293/cockpit
```

The pane docks on the right in the fullscreen layout once the terminal is 144 columns wide. `/cockpit` opens it at any width.

## Developing

```bash
claude plugin validate .
claude plugin test .
```

```
hooks/register.tsx    the pane, /cockpit, and the one hook per event that calls each feature
hooks/scene.tsx       the supercomputer and the main session's state
hooks/usage.tsx       Usage: the readings, the energy bars, countdown, day strip and Compact
hooks/pace.ts         pace, forecasts and the week's days: plain arithmetic
hooks/agents.tsx      Subagents: tracking each one and its rows
hooks/svg.ts          the SVG pictures for the desktop app, VS Code and mobile
hooks/tick.ts         the animation clock, running only while something moves
hooks/theme.ts        VS Code colours matched to Claude Code's theme
hooks/hub.ts          what the features share
types/index.d.ts      the values kept in $.state
tests/hub.test.tsx    the scene, bars, subagent rows, jumping in, and the SVG surfaces
```

## Credits

Usage is adapted from the token-weather mod in [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground), Copyright 2026 Anthropic PBC, under the Apache License 2.0; see `NOTICE`. Colours from VS Code's Dark Modern and Light Modern themes.

## License

Apache-2.0. See `LICENSE`.

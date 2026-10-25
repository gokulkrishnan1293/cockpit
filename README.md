# gokul-hub

A Claude Code mod that hosts my other mods in one place: a side pane that flags what's worth knowing, and one line above the prompt for all of them.

- **Hub pane** (`/hub`, or `h` on the band): flags at the top, then a section per feature. In the fullscreen layout at 144+ columns it opens by itself, docked on the right.
- **Band above the prompt:** one line for every feature, so they don't hide each other.

```text
◆ ⚑ 1  ☀ 7% ctx · session 83% · week 61% left  │  ▶ 5 edits   [ Hub ] [ Replay ]
```

## Features

| Feature | What it does | Flags |
| --- | --- | --- |
| **Weather** | Context window fill with a chart of recent turns; your 5-hour session limit (used, resets in) and weekly limit (left, reset day and time). | Context ≥ 75%, session limit ≥ 75% used, week ≤ 25% left (red past 90% / 10%). |
| **Blast Radius** | Holds risky shell commands (`rm -rf`, `git reset --hard`, `git clean`, `git checkout .`, force push, migrations), shows what they would change, and waits for **Proceed** (`1`) or **Cancel** (`2`). Cancel is the default; no answer in 10 minutes refuses it. | A command waiting on your answer. |
| **Replay** | Records the file edits Claude made in the last turn; `/replay` or `r` steps through them one diff at a time (`n` next, `p` prev, `c`/Esc close). | — |

Blast Radius reads the command's text, so a command hidden in a script or `bash -c "..."` isn't caught: treat it as a check, not a guarantee. To count pending migrations it runs your project's own listing command (`manage.py showmigrations`, `bin/rails db:migrate:status`, `prisma migrate status`, `alembic history`).

The rate limits only show on a Claude subscription, after the session's first reply.

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin install gokul-hub --marketplace gokulkrishnan1293/gokul-hub
```

From a shell:

```bash
claude plugin install gokul-hub --marketplace gokulkrishnan1293/gokul-hub
```

Needs Claude Code 2.1.287 or later (built and tested on 2.1.310).

## Developing

Install from a local clone, so edits take effect with `/reload-plugins`:

```bash
git clone https://github.com/gokulkrishnan1293/gokul-hub.git ~/gokul-hub
claude plugin marketplace add ~/gokul-hub
claude plugin install gokul-hub@gokul-hub --scope user
```

Check it:

```bash
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .      # once Claude Code has loaded the mod and written .claude-plugin/types/
```

### Layout

```text
hooks/register.tsx            the hub: pane, band, /hub, and the one hook per shared event
hooks/hub.ts                  shared constants and helpers
hooks/features/weather.tsx    context + plan limits
hooks/features/blast-radius.tsx  risky-command guard (wiring)
hooks/features/blast-logic.mjs   risky-command parsing and measuring
hooks/features/replay.tsx     edit replay
types/index.d.ts              the values kept in $.state
tests/                        claude plugin test
```

### Adding a feature

Claude Code reads every `on(...)` and `$.noun.method(...)` call from the source, so a feature is a set of **top-level exported functions** the hub calls by name (never methods on an object or a loop over a list), and an event without a matcher (`session.start`, `turn.complete`, ...) can be hooked **only once** in the whole mod.

1. Write `hooks/features/<name>.tsx` exporting what applies:
   - `register<Name>(on)`: the feature's own hooks: matched events (`tool.call` with `{ tool }`, its own `Pane` by `requestId`, its `command.run`).
   - `<name>SessionStart($)`, `<name>TurnComplete($)`: work for the shared events.
   - `<name>Flags($)`: `Flag[]` worth knowing now.
   - `<name>Summary($)`: a few words for the band, or `null`.
   - `<name>Section($, e, columns)`: its part of the hub pane, or `null`.
2. In `hooks/register.tsx`, import them and add each to its list: `register` (call `register<Name>(on)`), the `session.start` / `turn.complete` hooks, `allFlags`, `allSummaries`, `allSections`.
3. Declare any `$.state` values under `'gokul-hub'` in `types/index.d.ts`, made with `atom(...)`. Give a `Shaped` value a new shape tag when its fields change.
4. `claude plugin validate .`, add a test in `tests/`, `claude plugin test .`, then `/reload-plugins`.

## Credits

Weather, Blast Radius and Replay are ported from the token-weather, blast-radius and replay-theater mods in [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground), Copyright 2026 Anthropic PBC, under the Apache License 2.0. See `NOTICE`.

## License

Apache-2.0. See `LICENSE`.

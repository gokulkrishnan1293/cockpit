// The values cockpit keeps in $.state. They outlive a reload, so a change
// to a Shaped value's fields needs a new shape tag where its atom is made.

/** The context window's fill: tokens is absent before the first reply. */
export type Context = { tokens?: number; window: number; percent?: number }

/** One plan rate-limit window: five_hour, seven_day or a gateway's spend_limit. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** The main session: its model, and whether a turn is running since when. */
export type Main = { model?: string; isWorking: boolean; startedAt?: number; lastMs?: number }

/** One subagent, as its row shows it. */
export type Sub = {
  id: string
  /** Its agent type: Explore, Plan, general-purpose, a plugin's. */
  type: string
  /** The few words of its task. */
  description: string
  /** The start of the prompt it was given. */
  prompt: string
  model?: string
  /** The engine's AgentStatus: pending, running, waiting, idle, completed, failed, killed. */
  status: string
  startedAt: number
  endedAt?: number
  /** Tool calls finished. */
  tools: number
  /** The call running now, in a few words. */
  now?: string
  /** The last few calls, each "✓ Read a.ts" or "✗ Bash npm test". */
  recent: string[]
  /** Its context fill, as the last step's usage counted it. */
  tokens?: number
  background: boolean
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      context: Shaped<Context | null>
      limits: Shaped<Limit[]>
      now: number
      levels: Shaped<Record<string, number>>
      pulse: boolean
      frame: number
      clock: number
      main: Shaped<Main>
      subs: Shaped<Sub[]>
      expanded: Shaped<string[]>
      samples: Shaped<{ t: number; pct: number }[]>
    }
  }
}

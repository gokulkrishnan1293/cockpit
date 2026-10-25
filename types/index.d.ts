// The values gokul-hub keeps in $.state. They outlive a reload, so a change
// to a Shaped value's fields needs a new shape tag where its atom is made.

/** How loud a flag is: alert (red), warn (yellow), info (dim). */
export type FlagLevel = 'alert' | 'warn' | 'info'

/** Something worth knowing, shown at the top of the hub pane. */
export type Flag = { id: string; level: FlagLevel; text: string }

/** One context-window reading, taken after a main-loop turn. */
export type Reading = { tokens: number; window: number; percent: number }

/** One plan rate-limit window: five_hour, seven_day or a gateway's spend_limit. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type DiffLine = { op: '+' | '-' | ' ' | '~'; t: string }

/** One file edit of the last turn, as the replay steps through it. */
export type ReplayStep = { tool: string; file: string; diff: DiffLine[]; note: string }

/** A risky shell command Blast Radius held, and what was decided. */
export type Hold = {
  command: string
  label: string
  summary: string
  decision: 'waiting' | 'proceed' | 'cancel' | 'timeout' | 'interrupted' | 'error'
}

/** One tool call, as its card shows it. */
export type Op = {
  id: string
  tool: string
  icon: string
  detail: string
  status: 'running' | 'done' | 'error' | 'denied'
  ms?: number
  preview: string[]
  diff?: DiffLine[]
  isSubagent?: boolean
  /** A page the card can open in the browser: a fetch's URL, a dev server's. */
  url?: string
}

/** The hub's tabs. */
export type HubTab = 'activity' | 'flags' | 'usage'

declare module 'claude-code' {
  interface PluginState {
    'gokul-hub': {
      readings: Shaped<Reading[]>
      limits: Shaped<Limit[]>
      now: number
      replay: Shaped<ReplayStep[]>
      replayIndex: number
      replayOpen: boolean
      holds: Shaped<Hold[]>
      ops: Shaped<Op[]>
      tab: HubTab
    }
  }
}

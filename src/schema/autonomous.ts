export type AutonomousRunStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'

export interface AutonomousRunScope {
  title?: string
  layoutTitle?: string
  paths: string[]
  symbolPaths?: string[]
}

export interface AutonomousRunSummary {
  runId: string
  status: AutonomousRunStatus
  taskFile: string | null
  iteration: number
  phase: string
  task: string
  startedAt: string | null
  updatedAt: string | null
  totalTokens: number
  requestCount: number
  completedTodoCount: number
  terminalReason: string | null
  isActive: boolean
}

export interface AutonomousRunTodoSummary {
  key: string
  iteration: number
  phase: string
  task: string
  status: string
  requestCount: number
  firstTimestamp: string
  lastTimestamp: string
  roles: string[]
  kinds: string[]
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface AutonomousRunDetail extends AutonomousRunSummary {
  logExcerpt: string
  lastOutputExcerpt: string
  scope: AutonomousRunScope | null
  todos: AutonomousRunTodoSummary[]
}

export interface AutonomousRunTimelinePoint {
  key: string
  timestamp: string
  label: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface AutonomousRunStartRequest {
  scope?: AutonomousRunScope | null
  taskFile?: string | null
}

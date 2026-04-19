import type { AgentSessionSummary } from '../../schema/agent'

export type WorkspaceAgentRuntimeKind = NonNullable<AgentSessionSummary['runtimeKind']>

export type WorkspaceAgentCapabilities = NonNullable<AgentSessionSummary['capabilities']>

export interface WorkspaceAgentSnapshot {
  messages: unknown[]
  session: AgentSessionSummary
  timeline: unknown[]
}

export interface WorkspaceAgentRuntime {
  readonly capabilities: WorkspaceAgentCapabilities
  readonly kind: WorkspaceAgentRuntimeKind
  readonly model: string
  readonly sessionId: string
  readonly thinkingLevel?: AgentSessionSummary['thinkingLevel']
  readonly workspacePath: string
  compact(instructions?: string): Promise<void>
  dispose(): Promise<void>
  getSnapshot(): WorkspaceAgentSnapshot
  newSession(): Promise<void>
  prompt(input: {
    agentText?: string
    contextInjection?: string
    displayText: string
    mode?: 'send' | 'steer' | 'follow_up'
  }): Promise<void>
  resumeSession(sessionFile: string): Promise<void>
  setThinkingLevel(thinkingLevel: NonNullable<AgentSessionSummary['thinkingLevel']>): Promise<void>
  subscribe(listener: (event: unknown) => void): () => void
}

export const PI_SDK_AGENT_CAPABILITIES: WorkspaceAgentCapabilities = {
  compact: true,
  followUp: true,
  newSession: true,
  prompt: true,
  resumeSession: true,
  setThinkingLevel: true,
  steer: true,
}

export const CODEX_SUBSCRIPTION_AGENT_CAPABILITIES: WorkspaceAgentCapabilities = {
  compact: false,
  followUp: false,
  newSession: true,
  prompt: true,
  resumeSession: false,
  setThinkingLevel: false,
  steer: false,
}

export const DISABLED_AGENT_CAPABILITIES: WorkspaceAgentCapabilities = {
  compact: false,
  followUp: false,
  newSession: false,
  prompt: false,
  resumeSession: false,
  setThinkingLevel: false,
  steer: false,
}

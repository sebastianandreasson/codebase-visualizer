export type AgentRunState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'disabled'
  | 'error'

export interface AgentSessionSummary {
  id: string
  workspaceRootDir: string
  provider: string
  modelId: string
  transport: 'provider'
  createdAt: string
  updatedAt: string
  runState: AgentRunState
  bootPromptEnabled: boolean
  hasProviderApiKey: boolean
  lastError?: string
}

export interface AgentMessageBlock {
  kind: 'text' | 'thinking'
  text: string
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  blocks: AgentMessageBlock[]
  createdAt: string
  isStreaming?: boolean
}

export interface AgentToolInvocation {
  toolCallId: string
  toolName: string
  args: unknown
  startedAt: string
  endedAt?: string
  isError?: boolean
}

export interface AgentPermissionRequest {
  id: string
  kind: 'write' | 'exec'
  title: string
  description: string
}

export type AgentEvent =
  | {
      type: 'session_created'
      session: AgentSessionSummary
    }
  | {
      type: 'session_updated'
      session: AgentSessionSummary
    }
  | {
      type: 'message'
      sessionId: string
      message: AgentMessage
    }
  | {
      type: 'tool'
      sessionId: string
      invocation: AgentToolInvocation
    }
  | {
      type: 'permission_request'
      sessionId: string
      request: AgentPermissionRequest
    }

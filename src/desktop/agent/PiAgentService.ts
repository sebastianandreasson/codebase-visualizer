import { randomUUID } from 'node:crypto'

import { Agent, ProviderTransport, type AgentEvent as PiAgentEvent } from '@mariozechner/pi-agent'
import {
  getApiKey,
  getModel,
  getModels,
  type AssistantMessage,
  type Message,
  type KnownProvider,
} from '@mariozechner/pi-ai'

import type { AgentEvent, AgentMessage, AgentSessionSummary, AgentToolInvocation } from '../../schema/agent'

const DEFAULT_PI_PROVIDER = 'openai'
const DEFAULT_PI_MODEL_ID = 'gpt-4.1-mini'
const BOOT_PROMPT_ENV_NAME = 'CODEBASE_VISUALIZER_PI_BOOT_PROMPT'
const PI_PROVIDER_ENV_NAME = 'CODEBASE_VISUALIZER_PI_PROVIDER'
const PI_MODEL_ENV_NAME = 'CODEBASE_VISUALIZER_PI_MODEL'

interface PiAgentSessionRecord {
  agent: Agent
  activeAssistantMessageId: string | null
  summary: AgentSessionSummary
  toolInvocationById: Map<string, AgentToolInvocation>
  unsubscribe: () => void
  workspaceRootDir: string
}

export interface PiAgentServiceOptions {
  logger?: Pick<Console, 'error' | 'info' | 'warn'>
}

export class PiAgentService {
  private readonly logger: Pick<Console, 'error' | 'info' | 'warn'>
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private readonly sessionsByWorkspaceRootDir = new Map<string, PiAgentSessionRecord>()

  constructor(options: PiAgentServiceOptions = {}) {
    this.logger = options.logger ?? console
  }

  subscribe(listener: (event: AgentEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async ensureWorkspaceSession(workspaceRootDir: string) {
    const existingRecord = this.sessionsByWorkspaceRootDir.get(workspaceRootDir)

    if (existingRecord) {
      this.emit({
        type: 'session_updated',
        session: existingRecord.summary,
      })
      return existingRecord.summary
    }

    const provider = resolveProvider()
    const model = resolveModel(provider)
    const hasProviderApiKey = Boolean(getApiKey(provider))
    const bootPrompt = process.env[BOOT_PROMPT_ENV_NAME]?.trim() ?? ''
    const summary: AgentSessionSummary = {
      id: `pi-session:${randomUUID()}`,
      workspaceRootDir,
      provider,
      modelId: model.id,
      transport: 'provider',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runState: hasProviderApiKey ? 'ready' : 'disabled',
      bootPromptEnabled: bootPrompt.length > 0,
      hasProviderApiKey,
      lastError: hasProviderApiKey
        ? undefined
        : `No API key found for provider "${provider}".`,
    }
    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: buildWorkspaceSystemPrompt(workspaceRootDir),
        thinkingLevel: 'medium',
        tools: [],
      },
      transport: new ProviderTransport(),
    })

    const unsubscribe = agent.subscribe((event) => {
      this.handleAgentEvent(summary.id, workspaceRootDir, event)
    })
    const record: PiAgentSessionRecord = {
      agent,
      activeAssistantMessageId: null,
      summary,
      toolInvocationById: new Map(),
      unsubscribe,
      workspaceRootDir,
    }

    this.sessionsByWorkspaceRootDir.set(workspaceRootDir, record)
    this.emit({
      type: 'session_created',
      session: summary,
    })

    this.logger.info(
      `[codebase-visualizer][pi] Created workspace session ${summary.id} for ${workspaceRootDir} using ${summary.provider}/${summary.modelId}.`,
    )

    if (!hasProviderApiKey) {
      this.logger.warn(
        `[codebase-visualizer][pi] ${summary.lastError} Set the provider API key in your environment before prompting the agent.`,
      )
      return summary
    }

    if (bootPrompt.length > 0) {
      await this.runBootPrompt(record, bootPrompt)
    }

    return record.summary
  }

  async disposeWorkspaceSession(workspaceRootDir: string) {
    const record = this.sessionsByWorkspaceRootDir.get(workspaceRootDir)

    if (!record) {
      return
    }

    record.agent.abort()
    await record.agent.waitForIdle().catch(() => undefined)
    record.unsubscribe()
    this.sessionsByWorkspaceRootDir.delete(workspaceRootDir)
    this.logger.info(
      `[codebase-visualizer][pi] Disposed workspace session ${record.summary.id} for ${workspaceRootDir}.`,
    )
  }

  async disposeAllSessions() {
    for (const workspaceRootDir of [...this.sessionsByWorkspaceRootDir.keys()]) {
      await this.disposeWorkspaceSession(workspaceRootDir)
    }
  }

  getWorkspaceSessionSummary(workspaceRootDir: string) {
    return this.sessionsByWorkspaceRootDir.get(workspaceRootDir)?.summary ?? null
  }

  async promptWorkspaceSession(workspaceRootDir: string, message: string) {
    const record = this.sessionsByWorkspaceRootDir.get(workspaceRootDir)

    if (!record) {
      throw new Error('No workspace agent session exists for the active repository.')
    }

    if (!record.summary.hasProviderApiKey) {
      throw new Error(
        record.summary.lastError ??
          `No API key found for provider "${record.summary.provider}".`,
      )
    }

    const now = new Date().toISOString()
    this.emit({
      type: 'message',
      sessionId: record.summary.id,
      message: {
        id: `agent-message:${randomUUID()}`,
        role: 'user',
        blocks: [{ kind: 'text', text: message }],
        createdAt: now,
        isStreaming: false,
      },
    })

    await record.agent.prompt(message)
  }

  async cancelWorkspaceSession(workspaceRootDir: string) {
    const record = this.sessionsByWorkspaceRootDir.get(workspaceRootDir)

    if (!record) {
      return false
    }

    record.agent.abort()
    return true
  }

  private async runBootPrompt(record: PiAgentSessionRecord, prompt: string) {
    record.summary = updateSessionSummary(record.summary, {
      runState: 'running',
      lastError: undefined,
    })

    try {
      this.logger.info(
        `[codebase-visualizer][pi] Running boot prompt for workspace ${record.workspaceRootDir}.`,
      )
      await record.agent.prompt(prompt)
      record.summary = updateSessionSummary(record.summary, {
        runState: 'ready',
      })
      this.logger.info(
        `[codebase-visualizer][pi] Boot prompt completed for workspace ${record.workspaceRootDir}.`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown pi boot prompt failure.'
      record.summary = updateSessionSummary(record.summary, {
        runState: 'error',
        lastError: message,
      })
      this.logger.error(
        `[codebase-visualizer][pi] Boot prompt failed for workspace ${record.workspaceRootDir}: ${message}`,
      )
    }
  }

  private handleAgentEvent(
    sessionId: string,
    workspaceRootDir: string,
    event: PiAgentEvent,
  ) {
    const record = this.sessionsByWorkspaceRootDir.get(workspaceRootDir)

    if (!record) {
      return
    }

    switch (event.type) {
      case 'agent_start':
      case 'turn_start':
      case 'message_start':
        this.updateRecordSummary(record, {
          runState: 'running',
          lastError: undefined,
        })
        if (event.type === 'message_start' && event.message.role === 'assistant') {
          record.activeAssistantMessageId = `agent-message:${randomUUID()}`
          this.emitNormalizedMessage(record, event.message, true)
        }
        break

      case 'tool_execution_start':
        record.toolInvocationById.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          startedAt: new Date().toISOString(),
        })
        this.logger.info(
          `[codebase-visualizer][pi] ${sessionId} tool start: ${event.toolName}`,
        )
        this.emit({
          type: 'tool',
          sessionId,
          invocation: record.toolInvocationById.get(event.toolCallId)!,
        })
        break

      case 'tool_execution_end':
        this.finishToolInvocation(record, sessionId, event)
        if (event.isError) {
          this.logger.warn(
            `[codebase-visualizer][pi] ${sessionId} tool error: ${event.toolName}`,
          )
        } else {
          this.logger.info(
            `[codebase-visualizer][pi] ${sessionId} tool end: ${event.toolName}`,
          )
        }
        break

      case 'message_update':
        this.emitNormalizedMessage(record, event.message, true)
        if (event.assistantMessageEvent.type === 'text_delta') {
          this.logger.info(
            `[codebase-visualizer][pi] ${sessionId} delta: ${event.assistantMessageEvent.delta}`,
          )
        }
        break

      case 'turn_end':
      case 'agent_end':
        this.updateRecordSummary(record, {
          runState: record.summary.hasProviderApiKey ? 'ready' : 'disabled',
          lastError:
            event.type === 'turn_end' &&
            event.message.role === 'assistant' &&
            'errorMessage' in event.message &&
            event.message.errorMessage
              ? event.message.errorMessage
              : record.summary.lastError,
        })
        if (event.type === 'turn_end' && event.message.role === 'assistant') {
          this.emitNormalizedMessage(record, event.message, false)
          record.activeAssistantMessageId = null
        }
        break

      case 'message_end':
        if (event.message.role === 'assistant') {
          this.emitNormalizedMessage(record, event.message, false)
          record.activeAssistantMessageId = null
        }
        break
    }
  }

  private updateRecordSummary(
    record: PiAgentSessionRecord,
    changes: Partial<Pick<AgentSessionSummary, 'lastError' | 'runState'>>,
  ) {
    record.summary = updateSessionSummary(record.summary, changes)
    this.emit({
      type: 'session_updated',
      session: record.summary,
    })
  }

  private emitNormalizedMessage(
    record: PiAgentSessionRecord,
    message: Message | AssistantMessage,
    isStreaming: boolean,
  ) {
    const normalizedMessage = normalizeAgentMessage(
      record.summary.id,
      record.activeAssistantMessageId,
      message,
      isStreaming,
    )

    if (!normalizedMessage) {
      return
    }

    this.emit({
      type: 'message',
      sessionId: record.summary.id,
      message: normalizedMessage,
    })
  }

  private finishToolInvocation(
    record: PiAgentSessionRecord,
    sessionId: string,
    event: Extract<PiAgentEvent, { type: 'tool_execution_end' }>,
  ) {
    const existingInvocation = record.toolInvocationById.get(event.toolCallId)

    if (!existingInvocation) {
      return
    }

    const completedInvocation: AgentToolInvocation = {
      ...existingInvocation,
      endedAt: new Date().toISOString(),
      isError: event.isError,
    }

    record.toolInvocationById.set(event.toolCallId, completedInvocation)
    this.emit({
      type: 'tool',
      sessionId,
      invocation: completedInvocation,
    })
  }

  private emit(event: AgentEvent) {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

function resolveProvider(): KnownProvider {
  const envProvider = process.env[PI_PROVIDER_ENV_NAME]?.trim()

  if (!envProvider) {
    return DEFAULT_PI_PROVIDER
  }

  return envProvider as KnownProvider
}

function resolveModel(provider: KnownProvider) {
  const envModelId = process.env[PI_MODEL_ENV_NAME]?.trim()
  const preferredModelId = envModelId || DEFAULT_PI_MODEL_ID
  const exactModel = tryGetModel(provider, preferredModelId)

  if (exactModel) {
    return exactModel
  }

  const fallbackModel = getModels(provider)[0]

  if (!fallbackModel) {
    throw new Error(`No PI models available for provider "${provider}".`)
  }

  return fallbackModel
}

function tryGetModel(provider: KnownProvider, modelId: string) {
  try {
    return getModel(provider, modelId as never)
  } catch {
    return null
  }
}

function buildWorkspaceSystemPrompt(workspaceRootDir: string) {
  return [
    'You are embedded inside Codebase Visualizer, a desktop code exploration and editing environment.',
    `The active workspace root is: ${workspaceRootDir}`,
    'Prefer reasoning about the active repository and use tools rather than making assumptions about the workspace state.',
  ].join('\n')
}

function updateSessionSummary(
  summary: AgentSessionSummary,
  changes: Partial<Pick<AgentSessionSummary, 'lastError' | 'runState'>>,
): AgentSessionSummary {
  return {
    ...summary,
    ...changes,
    updatedAt: new Date().toISOString(),
  }
}

function normalizeAgentMessage(
  sessionId: string,
  activeAssistantMessageId: string | null,
  message: Message | AssistantMessage,
  isStreaming: boolean,
): AgentMessage | null {
  if (message.role !== 'assistant' && message.role !== 'toolResult') {
    return null
  }

  const id =
    message.role === 'assistant'
      ? activeAssistantMessageId ?? `agent-message:${sessionId}:assistant`
      : `agent-message:${sessionId}:${message.role}:${message.timestamp ?? Date.now()}`

  const contentBlocks = Array.isArray(message.content) ? message.content : []
  const blocks: AgentMessage['blocks'] = contentBlocks.reduce<AgentMessage['blocks']>((result, block) => {
    if (block.type === 'text') {
      result.push({ kind: 'text', text: block.text })
      return result
    }

    if (block.type === 'thinking') {
      result.push({ kind: 'thinking', text: block.thinking })
      return result
    }

    return result
  }, [] as AgentMessage['blocks'])

  return {
    id,
    role: message.role === 'toolResult' ? 'tool' : 'assistant',
    blocks,
    createdAt: new Date(message.timestamp ?? Date.now()).toISOString(),
    isStreaming,
  }
}

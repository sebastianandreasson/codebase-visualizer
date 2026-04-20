import type {
  AgentAuthMode,
  AgentCommandInfo,
  AgentControlState,
  AgentSessionSummary,
  AgentSettingsState,
  AgentTimelineItem,
} from '../schema/agent'
import type { DesktopAgentClient } from './DesktopAgentClient'
import {
  formatAgentModelOption,
  getAvailableAgentModelOptions,
  getSessionCapabilities,
  resolveAgentModelSelection,
} from './agentModelOptions'

export function buildComposerPlaceholder(
  session: AgentSessionSummary | null,
  controls: AgentControlState | null,
) {
  const commands = getVisibleCommandNames(controls)

  if (commands.length > 0) {
    return `${commands.slice(0, 7).map((command) => `/${command}`).join(' ')} or ask...`
  }

  const capabilities = getSessionCapabilities(session)
  const fallbackCommands = ['/model', '/session', '/clear']

  if (capabilities.newSession) {
    fallbackCommands.unshift('/new')
  }

  return `${fallbackCommands.join(' ')} or ask...`
}

export function getVisibleCommandNames(controls: AgentControlState | null) {
  if (!controls) {
    return []
  }

  return controls.commands
    .filter((command) => command.available && command.enabled)
    .sort(compareAgentCommands)
    .map((command) => command.name)
}

export function getCommandSuggestions(
  composerValue: string,
  controls: AgentControlState | null,
) {
  if (!controls) {
    return []
  }

  const trimmed = composerValue.trimStart()

  if (!trimmed.startsWith('/')) {
    return []
  }

  const query = trimmed.slice(1).split(/\s+/)[0].toLowerCase()

  return controls.commands
    .filter((command) =>
      command.available &&
      (query.length === 0 || command.name.toLowerCase().includes(query)),
    )
    .sort(compareAgentCommands)
    .slice(0, 8)
}

export function isSemanticodeLocalCommand(commandName: string) {
  return (
    commandName === 'clear' ||
    commandName === 'compact' ||
    commandName === 'model' ||
    commandName === 'new' ||
    commandName === 'resume' ||
    commandName === 'session' ||
    commandName === 'thinking' ||
    commandName === 'tools'
  )
}

export function parseToolCommandValue(
  commandValue: string,
  controls: AgentControlState,
) {
  const normalized = commandValue.trim().toLowerCase()

  if (normalized === 'all') {
    return controls.tools.map((tool) => tool.name)
  }

  if (normalized === 'none' || normalized === 'off') {
    return []
  }

  const availableTools = new Set(controls.tools.map((tool) => tool.name))
  const requestedTools = commandValue
    .split(/[,\s]+/)
    .map((toolName) => toolName.trim())
    .filter(Boolean)

  if (
    requestedTools.length === 0 ||
    requestedTools.some((toolName) => !availableTools.has(toolName))
  ) {
    return null
  }

  return [...new Set(requestedTools)]
}

export async function runAgentLocalCommand(input: AgentLocalCommandInput) {
  if (!input.command.startsWith('/')) {
    return false
  }

  const [commandName, ...commandArgs] = input.command.slice(1).trim().split(/\s+/)
  const commandValue = commandArgs.join(' ').trim()
  const controlState = input.getControls()
  const sdkCommand = controlState?.commands.find(
    (entry) => entry.name === commandName && entry.source !== 'semanticode',
  )

  if (sdkCommand && !isSemanticodeLocalCommand(commandName)) {
    return false
  }

  const runner = LOCAL_COMMAND_RUNNERS[commandName]

  if (!runner) {
    return false
  }

  await runner({
    ...input,
    commandName,
    commandValue,
    controlState,
  })
  return true
}

interface AgentLocalCommandInput {
  agentClient: Pick<
    DesktopAgentClient,
    | 'compact'
    | 'getControls'
    | 'getHttpState'
    | 'listSessions'
    | 'newSession'
    | 'resumeSession'
    | 'setActiveTools'
    | 'setThinkingLevel'
  >
  appendLocalLifecycle: (
    label: string,
    detail?: string,
    status?: Extract<AgentTimelineItem, { type: 'lifecycle' }>['status'],
  ) => void
  applyControls: (controls: AgentControlState) => void
  applySessionState: (
    session: AgentSessionSummary | null,
    timeline: AgentTimelineItem[] | undefined,
  ) => void
  authModeValue: AgentAuthMode
  command: string
  getControls: () => AgentControlState | null
  getSession: () => AgentSessionSummary | null
  providerValue: string
  session: AgentSessionSummary | null
  settings: AgentSettingsState | null
  setTimeline: (timeline: AgentTimelineItem[]) => void
  switchAgentModel: (input: {
    authMode?: AgentAuthMode
    modelId: string
    provider: string
  }) => Promise<void>
}

interface AgentLocalCommandRunnerInput extends AgentLocalCommandInput {
  commandName: string
  commandValue: string
  controlState: AgentControlState | null
}

type AgentLocalCommandRunner = (
  input: AgentLocalCommandRunnerInput,
) => Promise<void> | void

const LOCAL_COMMAND_RUNNERS: Record<string, AgentLocalCommandRunner | undefined> = {
  clear(input) {
    input.setTimeline([])
  },

  async compact(input) {
    const capabilities = getSessionCapabilities(input.getSession())

    if (!capabilities.compact) {
      input.appendLocalLifecycle('compact unavailable', 'Manual compaction is only available for pi SDK sessions.', 'error')
      return
    }

    const state = await input.agentClient.compact(input.commandValue || undefined)
    const nextControls = await input.agentClient.getControls().catch(() => null)

    if (nextControls) {
      input.applyControls(nextControls)
    }
    input.applySessionState(state.session, state.timeline ?? [])
  },

  async model(input) {
    const currentSession = input.getSession() ?? input.session
    const availableModels = getAvailableAgentModelOptions({
      authMode: input.authModeValue,
      controls: input.controlState,
      provider: input.providerValue,
      session: currentSession,
      settings: input.settings,
    })

    if (!input.commandValue) {
      input.appendLocalLifecycle(
        'model',
        currentSession
          ? [
              `${currentSession.provider}/${currentSession.modelId}`,
              availableModels.length > 1
                ? `available: ${availableModels.map(formatAgentModelOption).join(', ')}`
                : '',
            ].filter(Boolean).join(' · ')
          : 'No active session.',
        'completed',
      )
      return
    }

    const modelSelection = resolveAgentModelSelection(input.commandValue, {
      availableModels,
      provider: input.providerValue,
      session: currentSession,
    })

    if (!modelSelection) {
      input.appendLocalLifecycle(
        'model failed',
        `Unknown model ${input.commandValue}. Available: ${availableModels.map(formatAgentModelOption).join(', ')}`,
        'error',
      )
      return
    }

    await input.switchAgentModel(modelSelection)
  },

  async new(input) {
    const capabilities = getSessionCapabilities(input.getSession())

    if (!capabilities.newSession) {
      input.appendLocalLifecycle('new failed', 'New sessions are not available for the current agent runtime.', 'error')
      return
    }

    const nextSession = await input.agentClient.newSession()
    const state = await input.agentClient.getHttpState()
    const nextControls = await input.agentClient.getControls().catch(() => null)

    if (nextControls) {
      input.applyControls(nextControls)
    }
    input.applySessionState(nextSession ?? state.session, state.timeline ?? [])
  },

  async resume(input) {
    const capabilities = getSessionCapabilities(input.getSession())

    if (!capabilities.resumeSession) {
      input.appendLocalLifecycle('resume failed', 'Resume is only available for pi SDK sessions.', 'error')
      return
    }

    const result = await input.agentClient.listSessions()
    const latestSession = input.commandValue
      ? result.sessions.find((entry) => entry.path === input.commandValue || entry.id === input.commandValue)
      : result.sessions[0]

    if (!latestSession) {
      input.appendLocalLifecycle(
        'resume failed',
        input.commandValue
          ? `No pi session matched ${input.commandValue}.`
          : 'No previous pi session was found for this workspace.',
        'error',
      )
      return
    }

    const nextSession = await input.agentClient.resumeSession(latestSession.path)
    const state = await input.agentClient.getHttpState()
    const nextControls = await input.agentClient.getControls().catch(() => null)

    if (nextControls) {
      input.applyControls(nextControls)
    }
    input.applySessionState(nextSession ?? state.session, state.timeline ?? [])
  },

  async session(input) {
    const currentSession = input.getSession() ?? input.session
    const result = await input.agentClient.listSessions()

    input.appendLocalLifecycle(
      'session',
      currentSession?.sessionFile
        ? `${currentSession.sessionName ?? currentSession.id} · ${currentSession.sessionFile} · ${result.sessions.length} saved`
        : `${currentSession?.id ?? 'none'} · ${result.sessions.length} saved`,
      'completed',
    )
  },

  async thinking(input) {
    const capabilities = getSessionCapabilities(input.getSession())
    const currentSession = input.getSession() ?? input.session

    if (!capabilities.setThinkingLevel) {
      input.appendLocalLifecycle('thinking unavailable', 'Thinking level changes are only available for pi SDK sessions.', 'error')
      return
    }

    if (!input.commandValue) {
      const availableLevels = input.controlState?.availableThinkingLevels ?? []
      input.appendLocalLifecycle(
        'thinking',
        [
          `Current: ${currentSession?.thinkingLevel ?? 'medium'}`,
          availableLevels.length ? `available: ${availableLevels.join(', ')}` : '',
        ].filter(Boolean).join(' · '),
        'completed',
      )
      return
    }

    if (!isAgentThinkingLevel(input.commandValue)) {
      input.appendLocalLifecycle(
        'thinking failed',
        `Unknown level ${input.commandValue}. Use off, minimal, low, medium, high, or xhigh.`,
        'error',
      )
      return
    }

    const nextSession = await input.agentClient.setThinkingLevel(input.commandValue)
    const state = await input.agentClient.getHttpState()
    const nextControls = await input.agentClient.getControls().catch(() => null)

    if (nextControls) {
      input.applyControls(nextControls)
    }
    input.applySessionState(nextSession ?? state.session, state.timeline ?? [])
  },

  async tools(input) {
    const currentSession = input.getSession() ?? input.session

    if (currentSession?.runtimeKind !== 'pi-sdk') {
      input.appendLocalLifecycle('tools unavailable', 'Tool controls are only available for pi SDK sessions.', 'error')
      return
    }

    if (!input.controlState?.tools.length) {
      input.appendLocalLifecycle('tools unavailable', 'No SDK tools are loaded for this session yet.', 'error')
      return
    }

    if (!input.commandValue) {
      const activeTools = input.controlState.activeToolNames.length
        ? input.controlState.activeToolNames.join(', ')
        : 'none'
      const availableTools = input.controlState.tools.map((tool) => tool.name).join(', ')

      input.appendLocalLifecycle(
        'tools',
        `active: ${activeTools} · available: ${availableTools}`,
        'completed',
      )
      return
    }

    const requestedTools = parseToolCommandValue(input.commandValue, input.controlState)

    if (!requestedTools) {
      input.appendLocalLifecycle(
        'tools failed',
        `Unknown tool selection "${input.commandValue}". Use all, none, or names from: ${input.controlState.tools.map((tool) => tool.name).join(', ')}`,
        'error',
      )
      return
    }

    const nextControls = await input.agentClient.setActiveTools(requestedTools)

    input.applyControls(nextControls)
    input.appendLocalLifecycle(
      'tools updated',
      requestedTools.length ? requestedTools.join(', ') : 'No tools active.',
      'completed',
    )
  },
}

function isAgentThinkingLevel(
  value: string,
): value is NonNullable<AgentSessionSummary['thinkingLevel']> {
  return (
    value === 'off' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  )
}

function compareAgentCommands(left: AgentCommandInfo, right: AgentCommandInfo) {
  if (left.source === 'semanticode' && right.source !== 'semanticode') {
    return 1
  }

  if (left.source !== 'semanticode' && right.source === 'semanticode') {
    return -1
  }

  return left.name.localeCompare(right.name)
}

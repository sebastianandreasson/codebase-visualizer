import type {
  AgentAuthMode,
  AgentControlState,
  AgentSessionSummary,
  AgentSettingsState,
} from '../schema/agent'

export function getSessionCapabilities(session: AgentSessionSummary | null) {
  return session?.capabilities ?? {
    compact: false,
    followUp: false,
    newSession: false,
    prompt: false,
    resumeSession: false,
    setThinkingLevel: false,
    steer: false,
  }
}

export function getAvailableAgentModelOptions(input: {
  authMode: AgentAuthMode
  controls: AgentControlState | null
  provider: string
  session: AgentSessionSummary | null
  settings: AgentSettingsState | null
}) {
  const models = input.controls?.models.length
    ? input.controls.models
    : input.settings
      ? getSelectableModels(input.settings, input.authMode, input.provider)
        .map((model) => ({
          authMode: model.authMode ?? input.authMode,
          id: model.id,
          provider: input.provider,
        }))
      : []
  const withCurrentModel = input.session
    ? [
        {
          authMode: input.session.authMode,
          id: input.session.modelId,
          provider: input.session.provider,
        },
        ...models,
      ]
    : models
  const seen = new Set<string>()

  return withCurrentModel.filter((model) => {
    const key = createAgentModelKey(model)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function createAgentModelKey(model: AgentControlState['models'][number]) {
  return `${model.authMode}:${model.provider}/${model.id}`
}

export function groupAgentModelOptions(models: AgentControlState['models']) {
  const groups: Array<{
    authMode: AgentAuthMode
    key: string
    models: AgentControlState['models']
    provider: string
  }> = []
  const groupByKey = new Map<string, (typeof groups)[number]>()

  for (const model of models) {
    const key = `${model.authMode}:${model.provider}`
    let group = groupByKey.get(key)

    if (!group) {
      group = {
        authMode: model.authMode,
        key,
        models: [],
        provider: model.provider,
      }
      groupByKey.set(key, group)
      groups.push(group)
    }

    group.models.push(model)
  }

  return groups
}

export function parseAgentModelKey(modelKey: string) {
  const authSeparatorIndex = modelKey.indexOf(':')
  const authModeValue = authSeparatorIndex > 0
    ? modelKey.slice(0, authSeparatorIndex)
    : null
  const modelPath = authSeparatorIndex > 0
    ? modelKey.slice(authSeparatorIndex + 1)
    : modelKey
  const separatorIndex = modelPath.indexOf('/')

  if (separatorIndex <= 0 || separatorIndex === modelPath.length - 1) {
    return null
  }

  const authMode = authModeValue && isAgentAuthMode(authModeValue)
    ? authModeValue
    : undefined

  return {
    authMode,
    provider: modelPath.slice(0, separatorIndex),
    modelId: modelPath.slice(separatorIndex + 1),
  }
}

export function resolveAgentModelSelection(
  value: string,
  input: {
    availableModels: AgentControlState['models']
    provider: string
    session: AgentSessionSummary | null
  },
) {
  const parsedModel = value.includes('/')
    ? parseAgentModelKey(value)
    : {
        authMode: input.session?.authMode,
        modelId: value,
        provider: input.session?.provider ?? input.provider,
      }

  if (!parsedModel) {
    return null
  }

  const preferredAuthMode = parsedModel.authMode ?? input.session?.authMode
  const matchingModel = input.availableModels.find(
    (model) =>
      model.id === parsedModel.modelId &&
      model.provider === parsedModel.provider &&
      (!preferredAuthMode || model.authMode === preferredAuthMode),
  ) ?? input.availableModels.find(
    (model) =>
      model.id === parsedModel.modelId &&
      model.provider === parsedModel.provider &&
      (!parsedModel.authMode || model.authMode === parsedModel.authMode),
  )

  return matchingModel
    ? {
        authMode: matchingModel.authMode,
        modelId: matchingModel.id,
        provider: matchingModel.provider,
      }
    : null
}

export function getAgentRuntimeLabel(authMode: AgentAuthMode) {
  return authMode === 'brokered_oauth' ? 'Codex OAuth' : 'PI SDK'
}

export function formatAgentModelOption(model: AgentControlState['models'][number]) {
  return `${model.provider}/${model.id} (${getAgentRuntimeLabel(model.authMode)})`
}

export function isAgentAuthMode(value: string): value is AgentAuthMode {
  return value === 'api_key' || value === 'brokered_oauth'
}

export function getSelectableModels(
  settings: AgentSettingsState,
  authMode: AgentAuthMode,
  provider: string,
) {
  const availableModels = settings.availableModelsByProvider[provider] ?? []

  if (authMode !== 'brokered_oauth' || provider !== 'openai-codex') {
    return availableModels
  }

  return availableModels.filter((model) => model.id !== 'gpt-4.1-nano')
}

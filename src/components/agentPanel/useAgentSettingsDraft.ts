import { useCallback, useState } from 'react'

import type { AgentAuthMode, AgentSettingsState } from '../../schema/agent'

export interface AgentSettingsDraft {
  apiKey: string
  authMode: AgentAuthMode
  dirty: boolean
  manualRedirectUrl: string
  modelId: string
  openAiOAuthClientId: string
  openAiOAuthClientIdDirty: boolean
  openAiOAuthClientSecret: string
  openAiOAuthClientSecretDirty: boolean
  provider: string
}

type AgentSettingsDraftPatch = Partial<Pick<
  AgentSettingsDraft,
  | 'apiKey'
  | 'authMode'
  | 'manualRedirectUrl'
  | 'modelId'
  | 'openAiOAuthClientId'
  | 'openAiOAuthClientSecret'
  | 'provider'
>>

interface AgentSettingsDraftUpdateOptions {
  dirty?: boolean
  openAiOAuthClientIdDirty?: boolean
  openAiOAuthClientSecretDirty?: boolean
}

export function useAgentSettingsDraft() {
  const [settingsDraft, setSettingsDraft] = useState<AgentSettingsDraft>(
    () => createInitialAgentSettingsDraft(),
  )

  const updateSettingsDraft = useCallback((
    patch: AgentSettingsDraftPatch,
    options: AgentSettingsDraftUpdateOptions = {},
  ) => {
    setSettingsDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        ...patch,
        dirty: options.dirty ?? currentDraft.dirty,
        openAiOAuthClientIdDirty:
          options.openAiOAuthClientIdDirty ?? currentDraft.openAiOAuthClientIdDirty,
        openAiOAuthClientSecretDirty:
          options.openAiOAuthClientSecretDirty ??
          currentDraft.openAiOAuthClientSecretDirty,
      }

      return areAgentSettingsDraftsEqual(currentDraft, nextDraft)
        ? currentDraft
        : nextDraft
    })
  }, [])

  const applySettingsDraftFromSettings = useCallback((
    nextSettings: AgentSettingsState,
  ) => {
    const nextDraft = createAgentSettingsDraftFromSettings(nextSettings)

    setSettingsDraft((currentDraft) =>
      areAgentSettingsDraftsEqual(currentDraft, nextDraft) ? currentDraft : nextDraft,
    )
  }, [])

  return {
    applySettingsDraftFromSettings,
    settingsDraft,
    updateSettingsDraft,
  }
}

function createInitialAgentSettingsDraft(): AgentSettingsDraft {
  return {
    apiKey: '',
    authMode: 'brokered_oauth',
    dirty: false,
    manualRedirectUrl: '',
    modelId: '',
    openAiOAuthClientId: '',
    openAiOAuthClientIdDirty: false,
    openAiOAuthClientSecret: '',
    openAiOAuthClientSecretDirty: false,
    provider: '',
  }
}

function createAgentSettingsDraftFromSettings(
  settings: AgentSettingsState,
): AgentSettingsDraft {
  return {
    apiKey: '',
    authMode: settings.authMode,
    dirty: false,
    manualRedirectUrl: '',
    modelId: settings.modelId,
    openAiOAuthClientId: settings.openAiOAuthClientId ?? '',
    openAiOAuthClientIdDirty: false,
    openAiOAuthClientSecret: '',
    openAiOAuthClientSecretDirty: false,
    provider: settings.provider,
  }
}

function areAgentSettingsDraftsEqual(
  left: AgentSettingsDraft,
  right: AgentSettingsDraft,
) {
  return (
    left.apiKey === right.apiKey &&
    left.authMode === right.authMode &&
    left.dirty === right.dirty &&
    left.manualRedirectUrl === right.manualRedirectUrl &&
    left.modelId === right.modelId &&
    left.openAiOAuthClientId === right.openAiOAuthClientId &&
    left.openAiOAuthClientIdDirty === right.openAiOAuthClientIdDirty &&
    left.openAiOAuthClientSecret === right.openAiOAuthClientSecret &&
    left.openAiOAuthClientSecretDirty === right.openAiOAuthClientSecretDirty &&
    left.provider === right.provider
  )
}

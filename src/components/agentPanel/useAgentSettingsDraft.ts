import { useCallback, useState } from 'react'

import type { AgentAuthMode, AgentSettingsState } from '../../schema/agent'

export interface AgentSettingsDraft {
  apiKey: string
  authMode: AgentAuthMode
  dirty: boolean
  manualRedirectUrl: string
  modelId: string
  openAiOAuthClientId: string
  openAiOAuthClientSecret: string
  provider: string
}

export type AgentSettingsDraftPatch = Partial<Pick<
  AgentSettingsDraft,
  | 'apiKey'
  | 'authMode'
  | 'manualRedirectUrl'
  | 'modelId'
  | 'openAiOAuthClientId'
  | 'openAiOAuthClientSecret'
  | 'provider'
>>

export interface AgentSettingsDraftUpdateOptions {
  dirty?: boolean
}

const INITIAL_AGENT_SETTINGS_DRAFT: AgentSettingsDraft = {
  apiKey: '',
  authMode: 'brokered_oauth',
  dirty: false,
  manualRedirectUrl: '',
  modelId: '',
  openAiOAuthClientId: '',
  openAiOAuthClientSecret: '',
  provider: '',
}

export function useAgentSettingsDraft() {
  const [settingsDraft, setSettingsDraft] = useState<AgentSettingsDraft>(
    INITIAL_AGENT_SETTINGS_DRAFT,
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
      }

      return nextDraft
    })
  }, [])

  const applySettingsDraftFromSettings = useCallback((
    nextSettings: AgentSettingsState,
  ) => {
    const nextDraft = createAgentSettingsDraftFromSettings(nextSettings)

    setSettingsDraft(nextDraft)
  }, [])

  return {
    applySettingsDraftFromSettings,
    settingsDraft,
    updateSettingsDraft,
  }
}

function createAgentSettingsDraftFromSettings(
  settings: AgentSettingsState,
): AgentSettingsDraft {
  return {
    ...INITIAL_AGENT_SETTINGS_DRAFT,
    authMode: settings.authMode,
    modelId: settings.modelId,
    openAiOAuthClientId: settings.openAiOAuthClientId ?? '',
    provider: settings.provider,
  }
}

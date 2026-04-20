import type { Dispatch, SetStateAction } from 'react'

import type { DesktopAgentClient } from '../../agent/DesktopAgentClient'
import { getSelectableModels } from '../../agent/agentModelOptions'
import type {
  AgentAuthMode,
  AgentSessionSummary,
  AgentSettingsState,
  AgentTimelineItem,
  AgentToolProfile,
} from '../../schema/agent'
import type { useAgentSettingsDraft } from '../agentPanel/useAgentSettingsDraft'

type ApplySettingsDraftFromSettings = ReturnType<
  typeof useAgentSettingsDraft
>['applySettingsDraftFromSettings']

export function useAgentSettingsActions({
  agentClient,
  apiKeyValue,
  applySettingsDraftFromSettings,
  authModeValue,
  manualRedirectUrlValue,
  modelValue,
  openAiOAuthClientIdValue,
  openAiOAuthClientSecretValue,
  providerValue,
  setErrorMessage,
  setOauthLoginUrl,
  setOauthStatusMessage,
  setSession,
  setSettings,
  setSettingsPending,
  setTimeline,
  settings,
  settingsDraftDirty,
  toolProfileValue,
}: {
  agentClient: DesktopAgentClient
  apiKeyValue: string
  applySettingsDraftFromSettings: ApplySettingsDraftFromSettings
  authModeValue: AgentAuthMode
  manualRedirectUrlValue: string
  modelValue: string
  openAiOAuthClientIdValue: string
  openAiOAuthClientSecretValue: string
  providerValue: string
  setErrorMessage: Dispatch<SetStateAction<string | null>>
  setOauthLoginUrl: Dispatch<SetStateAction<string | null>>
  setOauthStatusMessage: Dispatch<SetStateAction<string | null>>
  setSession: Dispatch<SetStateAction<AgentSessionSummary | null>>
  setSettings: Dispatch<SetStateAction<AgentSettingsState | null>>
  setSettingsPending: Dispatch<SetStateAction<boolean>>
  setTimeline: Dispatch<SetStateAction<AgentTimelineItem[]>>
  settings: AgentSettingsState | null
  settingsDraftDirty: boolean
  toolProfileValue: AgentToolProfile
}) {
  async function persistSettingsDraftIfNeeded() {
    if (!settingsDraftDirty) {
      return
    }

    if (!providerValue || !modelValue) {
      throw new Error('Select both a provider and a model before continuing.')
    }

    setSettingsPending(true)

    try {
      const nextSettings = await agentClient.saveSettings({
        authMode: authModeValue,
        provider: providerValue,
        modelId: modelValue,
        toolProfile: toolProfileValue,
        apiKey: authModeValue === 'api_key' ? apiKeyValue.trim() || undefined : undefined,
        openAiOAuthClientId:
          settings?.canEditOpenAiOAuthConfig ? openAiOAuthClientIdValue : undefined,
        openAiOAuthClientSecret:
          settings?.canEditOpenAiOAuthConfig && openAiOAuthClientSecretValue.trim().length > 0
            ? openAiOAuthClientSecretValue.trim()
            : undefined,
      })

      setSettings(nextSettings)
      applySettingsDraftFromSettings(nextSettings)
    } finally {
      setSettingsPending(false)
    }
  }

  async function handleSaveSettings() {
    if (!providerValue || !modelValue) {
      setErrorMessage('Select both a provider and a model before saving.')
      return
    }

    await runSettingsAction(
      async () => {
        setOauthStatusMessage(null)
        const nextSettings = await agentClient.saveSettings({
          authMode: authModeValue,
          provider: providerValue,
          modelId: modelValue,
          toolProfile: toolProfileValue,
          apiKey: apiKeyValue.trim() || undefined,
          openAiOAuthClientId:
            settings?.canEditOpenAiOAuthConfig ? openAiOAuthClientIdValue : undefined,
          openAiOAuthClientSecret:
            settings?.canEditOpenAiOAuthConfig && openAiOAuthClientSecretValue.trim().length > 0
              ? openAiOAuthClientSecretValue.trim()
              : undefined,
        })

        setSettings(nextSettings)
        applySettingsDraftFromSettings(nextSettings)
        await refreshSessionState()
      },
      'Failed to save the agent settings.',
    )
  }

  async function handleClearApiKey() {
    if (!providerValue || !modelValue) {
      return
    }

    await runSettingsAction(
      async () => {
        const nextSettings = await agentClient.saveSettings({
          authMode: authModeValue,
          provider: providerValue,
          modelId: modelValue,
          toolProfile: toolProfileValue,
          clearApiKey: true,
        })

        setSettings(nextSettings)
        applySettingsDraftFromSettings(nextSettings)
        await refreshSessionState()
      },
      'Failed to clear the stored API key.',
    )
  }

  async function handleStartBrokeredLogin() {
    const effectiveProvider = 'openai-codex'
    const availableCodexModels = settings
      ? getSelectableModels(settings, 'brokered_oauth', effectiveProvider)
      : []
    const effectiveModelId =
      modelValue ||
      settings?.modelId ||
      availableCodexModels[0]?.id ||
      ''

    if (!effectiveModelId) {
      setErrorMessage('No OpenAI Codex model is available yet for sign-in.')
      return
    }

    await runSettingsAction(
      async () => {
        const nextSettings = await agentClient.saveSettings({
          authMode: 'brokered_oauth',
          provider: effectiveProvider,
          modelId: effectiveModelId,
          toolProfile: toolProfileValue,
          openAiOAuthClientId:
            settings?.canEditOpenAiOAuthConfig ? openAiOAuthClientIdValue : undefined,
          openAiOAuthClientSecret:
            settings?.canEditOpenAiOAuthConfig && openAiOAuthClientSecretValue.trim().length > 0
              ? openAiOAuthClientSecretValue.trim()
              : undefined,
        })

        setSettings(nextSettings)
        applySettingsDraftFromSettings(nextSettings)

        const result = await agentClient.beginBrokeredLogin()
        const brokerSession = await agentClient.getBrokerSession()

        setSettings((current) =>
          current
            ? {
                ...current,
                brokerSession,
              }
            : current,
        )
        setOauthStatusMessage(
          result.message ??
            (result.loginUrl
              ? `Opened the browser for OpenAI sign-in.`
              : 'OpenAI sign-in did not return a browser URL.'),
        )
        setOauthLoginUrl(result.loginUrl ?? null)
      },
      'Failed to start OpenAI sign-in.',
    )
  }

  async function handleBrokeredLogout() {
    await runSettingsAction(
      async () => {
        setOauthStatusMessage(null)
        setOauthLoginUrl(null)
        const brokerSession = await agentClient.logoutBrokeredAuthSession()

        setSettings((current) =>
          current
            ? {
                ...current,
                brokerSession,
              }
            : current,
        )
        await refreshSessionState()
      },
      'Failed to sign out from OpenAI OAuth.',
    )
  }

  async function handleImportCodexLogin() {
    await runSettingsAction(
      async () => {
        setOauthStatusMessage(null)
        const result = await agentClient.importCodexAuthSession()
        const nextSettings = await agentClient.getSettings()

        setSettings(nextSettings)
        applySettingsDraftFromSettings(nextSettings)
        await refreshSessionState()
        setOauthStatusMessage(result.message)
        setOauthLoginUrl(null)
      },
      'Failed to import the local Codex login.',
    )
  }

  async function handleClearOpenAiOAuthOverride() {
    if (!settings?.canEditOpenAiOAuthConfig || !providerValue || !modelValue) {
      return
    }

    await runSettingsAction(
      async () => {
        const nextSettings = await agentClient.saveSettings({
          authMode: authModeValue,
          provider: providerValue,
          modelId: modelValue,
          toolProfile: toolProfileValue,
          clearOpenAiOAuthClientId: true,
          clearOpenAiOAuthClientSecret: true,
        })

        setSettings(nextSettings)
        applySettingsDraftFromSettings(nextSettings)
        await refreshSessionState()
      },
      'Failed to clear the OpenAI OAuth override.',
    )
  }

  async function handleCompleteManualRedirect() {
    const callbackUrl = manualRedirectUrlValue.trim()

    if (!callbackUrl) {
      setErrorMessage('Paste the final redirected URL before completing sign-in.')
      return
    }

    await runSettingsAction(
      async () => {
        setOauthStatusMessage(null)
        const result = await agentClient.completeBrokeredLogin(callbackUrl)
        const nextSettings = await agentClient.getSettings()

        setSettings(nextSettings)
        applySettingsDraftFromSettings(nextSettings)
        await refreshSessionState()
        setOauthStatusMessage(result.message)
        setOauthLoginUrl(null)
      },
      'Failed to complete sign-in from the pasted redirect URL.',
    )
  }

  async function runSettingsAction(
    action: () => Promise<void>,
    fallbackMessage: string,
  ) {
    try {
      setSettingsPending(true)
      setErrorMessage(null)
      await action()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : fallbackMessage)
    } finally {
      setSettingsPending(false)
    }
  }

  async function refreshSessionState() {
    const nextSession = await agentClient.createSession()
    setSession(nextSession)
    const state = await agentClient.getHttpState()
    setSession(state.session)
    setTimeline(state.timeline ?? [])
  }

  return {
    handleBrokeredLogout,
    handleClearApiKey,
    handleClearOpenAiOAuthOverride,
    handleCompleteManualRedirect,
    handleImportCodexLogin,
    handleSaveSettings,
    handleStartBrokeredLogin,
    persistSettingsDraftIfNeeded,
  }
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { AgentScopeContext } from '../agent/agentScopeContext'
import type {
  AgentSessionSummary,
  PreprocessedWorkspaceContext,
  WorkingSetState,
  WorkspaceProfile,
} from '../types'
import { AgentModelPicker } from './agent/AgentModelPicker'
import { AgentSessionRail } from './agent/AgentSessionRail'
import { AgentSettingsPanel } from './agent/AgentSettingsPanel'
import { AgentTerminal } from './agent/AgentTerminal'
import { useAgentSessionController } from './agent/useAgentSessionController'

export type { AgentScopeContext } from '../agent/agentScopeContext'

type AgentThinkingLevel = NonNullable<AgentSessionSummary['thinkingLevel']>

interface AgentPanelProps {
  autoFocusComposer?: boolean
  composerFocusRequestKey?: number
  desktopHostAvailable?: boolean
  inspectorContext?: AgentScopeContext
  onActiveSessionChange?: (session: AgentSessionSummary | null) => void
  onOpenSettings?: () => void
  onRunSettled?: () => Promise<void>
  onAdoptInspectorContextAsWorkingSet?: () => void
  onChatSessionCleared?: (session: AgentSessionSummary | null) => void
  onClearWorkingSet?: () => void
  preprocessedWorkspaceContext?: PreprocessedWorkspaceContext | null
  promptSeed?: {
    id: string
    value: string
  } | null
  sessionRailHostId?: string
  settingsOnly?: boolean
  workingSet?: WorkingSetState | null
  workingSetContext?: AgentScopeContext | null
  workspaceProfile?: WorkspaceProfile | null
}

export function AgentPanel({
  autoFocusComposer = false,
  composerFocusRequestKey = 0,
  desktopHostAvailable = false,
  inspectorContext,
  onActiveSessionChange,
  onOpenSettings,
  onRunSettled,
  onAdoptInspectorContextAsWorkingSet,
  onChatSessionCleared,
  onClearWorkingSet,
  preprocessedWorkspaceContext = null,
  promptSeed = null,
  sessionRailHostId,
  settingsOnly = false,
  workingSet = null,
  workingSetContext = null,
  workspaceProfile = null,
}: AgentPanelProps) {
  const {
    apiKeyValue,
    authModeValue,
    availableModels,
    availableSessions,
    commandSuggestions,
    composerRef,
    composerValue,
    errorMessage,
    handleBrokeredLogout,
    handleClearApiKey,
    handleClearOpenAiOAuthOverride,
    handleCompleteManualRedirect,
    handleComposerChange,
    handleImportCodexLogin,
    handleDeleteSession,
    handleNewSession,
    handleResumeSession,
    handleSaveSettings,
    handleStartBrokeredLogin,
    handleSubmit,
    handleThinkingLevelChange,
    handleTerminalModelChange,
    handleTimelineScroll,
    hasInspectorContext,
    hasWorkingSetContext,
    manualRedirectUrlValue,
    messageListRef,
    modelValue,
    oauthLoginUrl,
    oauthStatusMessage,
    openAiOAuthClientIdValue,
    openAiOAuthClientSecretValue,
    pending,
    providerValue,
    selectedModelKey,
    sendDisabledReason,
    session,
    sessionActionPendingPath,
    sessionCapabilities,
    sessionControls,
    sessionIsInteractive,
    sessionListErrorMessage,
    sessionListPending,
    settings,
    settingsPending,
    terminalModelOptions,
    timeline,
    toolProfileValue,
    updateSettingsDraft,
    workingSetMatchesInspectorContext,
  } = useAgentSessionController({
    autoFocusComposer,
    composerFocusRequestKey,
    desktopHostAvailable,
    inspectorContext,
    onActiveSessionChange,
    onChatSessionCleared,
    onRunSettled,
    preprocessedWorkspaceContext,
    promptSeed,
    settingsOnly,
    workingSetContext,
    workspaceProfile,
  })
  const [sessionRailHost, setSessionRailHost] = useState<HTMLElement | null>(null)
  const thinkingLevels = sessionControls?.availableThinkingLevels ?? []
  const selectedThinkingLevel = (
    session?.thinkingLevel ??
    thinkingLevels[0] ??
    'medium'
  ) as AgentThinkingLevel

  useEffect(() => {
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setSessionRailHost(sessionRailHostId ? document.getElementById(sessionRailHostId) : null)
      }
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [sessionRailHostId])

  const sessionRail = settingsOnly ? null : (
    <AgentSessionRail
      activeSession={session}
      busy={pending || Boolean(sessionActionPendingPath)}
      deleteAvailable
      errorMessage={sessionListErrorMessage}
      newAvailable={sessionCapabilities.newSession && session?.runState !== 'running'}
      onDeleteSession={handleDeleteSession}
      onNewSession={handleNewSession}
      onResumeSession={handleResumeSession}
      pendingSessionPath={sessionActionPendingPath}
      resumeAvailable={sessionCapabilities.resumeSession && session?.runState !== 'running'}
      sessions={availableSessions}
      sessionsPending={sessionListPending}
    />
  )

  return (
    <div className={`cbv-agent-panel${settingsOnly ? ' is-settings-only' : ''}`}>
      {sessionRail && sessionRailHost ? createPortal(sessionRail, sessionRailHost) : null}
      <div className="cbv-agent-meta">
        <div className="cbv-agent-meta-main">
          {session || terminalModelOptions.length > 0 ? (
            <div className="cbv-agent-session-controls">
              <AgentModelPicker
                disabled={
                  pending ||
                  settingsPending ||
                  session?.runState === 'running' ||
                  terminalModelOptions.length <= 1
                }
                models={terminalModelOptions}
                onSelect={(modelKey) => {
                  void handleTerminalModelChange(modelKey)
                }}
                selectedModelKey={selectedModelKey}
                title={
                  session?.runState === 'running'
                    ? 'Model switching is disabled while the agent is running.'
                    : 'Switch agent model'
                }
              />
              {thinkingLevels.length > 0 ? (
                <label className="cbv-agent-thinking-picker">
                  <span aria-hidden="true">thinking</span>
                  <select
                    aria-label="Thinking level"
                    disabled={
                      pending ||
                      settingsPending ||
                      session?.runState === 'running' ||
                      !sessionCapabilities.setThinkingLevel ||
                      thinkingLevels.length <= 1
                    }
                    onChange={(event) => {
                      void handleThinkingLevelChange(event.target.value as AgentThinkingLevel)
                    }}
                    title={
                      session?.runState === 'running'
                        ? 'Thinking level changes are disabled while the agent is running.'
                        : 'Change thinking level'
                    }
                    value={selectedThinkingLevel}
                  >
                    {thinkingLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : (
            <strong>Starting…</strong>
          )}
        </div>
        <div className={`cbv-agent-status is-${session?.runState ?? 'idle'}`}>
          {session?.runState ?? 'idle'}
        </div>
      </div>

      <div className="cbv-agent-notices">
        {session?.lastError ? (
          <p className="cbv-agent-warning">{session.lastError}</p>
        ) : null}

        {errorMessage ? (
          <p className="cbv-agent-error">{errorMessage}</p>
        ) : null}
      </div>

      {settingsOnly ? (
        <AgentSettingsPanel
          apiKeyValue={apiKeyValue}
          authModeValue={authModeValue}
          availableModels={availableModels}
          handleBrokeredLogout={handleBrokeredLogout}
          handleClearApiKey={handleClearApiKey}
          handleClearOpenAiOAuthOverride={handleClearOpenAiOAuthOverride}
          handleCompleteManualRedirect={handleCompleteManualRedirect}
          handleImportCodexLogin={handleImportCodexLogin}
          handleSaveSettings={handleSaveSettings}
          handleStartBrokeredLogin={handleStartBrokeredLogin}
          manualRedirectUrlValue={manualRedirectUrlValue}
          modelValue={modelValue}
          oauthLoginUrl={oauthLoginUrl}
          oauthStatusMessage={oauthStatusMessage}
          openAiOAuthClientIdValue={openAiOAuthClientIdValue}
          openAiOAuthClientSecretValue={openAiOAuthClientSecretValue}
          providerValue={providerValue}
          settings={settings}
          settingsPending={settingsPending}
          toolProfileValue={toolProfileValue}
          updateSettingsDraft={updateSettingsDraft}
        />
      ) : (
        <div className="cbv-agent-chat-shell">
          {sessionRailHostId ? null : sessionRail}
          <div className="cbv-agent-chat-main">
            {!sessionIsInteractive ? (
              <div className="cbv-agent-setup-prompt">
                <strong>Agent settings needed</strong>
                <p>
                  {session?.lastError ??
                    'Open settings to sign in, choose a model, or update agent configuration before chatting here.'}
                </p>
                {onOpenSettings ? (
                  <button
                    onClick={onOpenSettings}
                    type="button"
                  >
                    Open Settings
                  </button>
                ) : null}
              </div>
            ) : (
              <AgentTerminal
                commandSuggestions={commandSuggestions}
                composerRef={composerRef}
                composerValue={composerValue}
                hasInspectorContext={hasInspectorContext}
                hasWorkingSetContext={hasWorkingSetContext}
                inspectorContext={inspectorContext}
                messageListRef={messageListRef}
                onAdoptInspectorContextAsWorkingSet={onAdoptInspectorContextAsWorkingSet}
                onClearWorkingSet={onClearWorkingSet}
                onComposerChange={handleComposerChange}
                onSubmit={handleSubmit}
                onTimelineScroll={handleTimelineScroll}
                pending={pending}
                sendDisabledReason={sendDisabledReason}
                session={session!}
                sessionCapabilities={sessionCapabilities}
                sessionControls={sessionControls}
                timeline={timeline}
                workingSet={workingSet}
                workingSetContext={workingSetContext}
                workingSetMatchesInspectorContext={workingSetMatchesInspectorContext}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

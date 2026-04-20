import type {
  AgentAuthMode,
  AgentSettingsState,
} from '../../schema/agent'
import type { useAgentSettingsDraft } from '../agentPanel/useAgentSettingsDraft'

type UpdateSettingsDraft = ReturnType<typeof useAgentSettingsDraft>['updateSettingsDraft']

export function AgentSettingsPanel({
  apiKeyValue,
  authModeValue,
  availableModels,
  handleBrokeredLogout,
  handleClearApiKey,
  handleClearOpenAiOAuthOverride,
  handleCompleteManualRedirect,
  handleImportCodexLogin,
  handleSaveSettings,
  handleStartBrokeredLogin,
  manualRedirectUrlValue,
  modelValue,
  oauthLoginUrl,
  oauthStatusMessage,
  openAiOAuthClientIdValue,
  openAiOAuthClientSecretValue,
  providerValue,
  settings,
  settingsPending,
  updateSettingsDraft,
}: {
  apiKeyValue: string
  authModeValue: AgentAuthMode
  availableModels: Array<{ authMode?: AgentAuthMode; id: string }>
  handleBrokeredLogout: () => void | Promise<void>
  handleClearApiKey: () => void | Promise<void>
  handleClearOpenAiOAuthOverride: () => void | Promise<void>
  handleCompleteManualRedirect: () => void | Promise<void>
  handleImportCodexLogin: () => void | Promise<void>
  handleSaveSettings: () => void | Promise<void>
  handleStartBrokeredLogin: () => void | Promise<void>
  manualRedirectUrlValue: string
  modelValue: string
  oauthLoginUrl: string | null
  oauthStatusMessage: string | null
  openAiOAuthClientIdValue: string
  openAiOAuthClientSecretValue: string
  providerValue: string
  settings: AgentSettingsState | null
  settingsPending: boolean
  updateSettingsDraft: UpdateSettingsDraft
}) {
  return (
    <section className="cbv-agent-settings">
      <div className="cbv-agent-settings-header">
        <div>
          <p className="cbv-eyebrow">Agent settings</p>
          <strong>Provider, model, and API key</strong>
        </div>
        {settings ? (
          <span className="cbv-agent-settings-storage">
            {settings.storageKind === 'safe_storage' ? 'Stored with system encryption' : 'Stored in app data'}
          </span>
        ) : null}
      </div>

      <div className="cbv-agent-settings-grid">
        <label>
          <span>Auth mode</span>
          <select
            disabled={settingsPending || !settings}
            onChange={(event) => {
              updateSettingsDraft(
                { authMode: event.target.value as AgentAuthMode },
                { dirty: true },
              )
            }}
            value={authModeValue}
          >
            <option value="brokered_oauth">OpenAI OAuth</option>
            <option value="api_key">API key</option>
          </select>
        </label>

        <label>
          <span>Provider</span>
          <select
            disabled={settingsPending || !settings || authModeValue === 'brokered_oauth'}
            onChange={(event) => {
              updateSettingsDraft({ provider: event.target.value }, { dirty: true })
            }}
            value={providerValue}
          >
            {(settings?.availableProviders ?? []).map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Model</span>
          <select
            disabled={settingsPending || availableModels.length === 0}
            onChange={(event) => {
              updateSettingsDraft({ modelId: event.target.value }, { dirty: true })
            }}
            value={modelValue}
          >
            {availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </label>

        {authModeValue === 'api_key' ? (
          <label className="is-wide">
            <span>API key</span>
            <input
              autoComplete="off"
              disabled={settingsPending}
              onChange={(event) => {
                updateSettingsDraft({ apiKey: event.target.value }, { dirty: true })
              }}
              placeholder={settings?.hasApiKey ? 'Stored key present. Enter a new key to replace it.' : 'Enter provider API key'}
              type="password"
              value={apiKeyValue}
            />
          </label>
        ) : (
          <div className="cbv-agent-oauth-placeholder">
            <strong>OpenAI OAuth</strong>
            <p>
              Sign in through your OpenAI account in the browser. The desktop app
              handles a localhost callback and stores the returned tokens locally.
            </p>
            <p>
              OAuth session state: {settings?.brokerSession.state ?? 'signed_out'}.
            </p>
            {settings?.brokerSession.accountLabel ? (
              <p>Signed in as: {settings.brokerSession.accountLabel}</p>
            ) : null}
            <p>
              If the browser does not open automatically, use the login URL below.
            </p>
            <p>
              The desktop app starts a localhost callback server automatically.
              If that does not complete sign-in, paste the final redirected URL
              below and finish the flow manually.
            </p>
            <label className="is-wide">
              <span>Manual redirect URL fallback</span>
              <input
                autoComplete="off"
                disabled={settingsPending}
                onChange={(event) => {
                  updateSettingsDraft({ manualRedirectUrl: event.target.value })
                }}
                placeholder="Paste the final redirected browser URL"
                type="url"
                value={manualRedirectUrlValue}
              />
            </label>
            {oauthStatusMessage ? (
              <p className="cbv-agent-warning">{oauthStatusMessage}</p>
            ) : null}
            {oauthLoginUrl ? (
              <p className="cbv-agent-warning">
                Login URL:{' '}
                <a href={oauthLoginUrl} rel="noreferrer" target="_blank">
                  open sign-in page
                </a>
              </p>
            ) : null}
            <p>
              For local development, you can also import your existing Codex
              ChatGPT login from <code>~/.codex/auth.json</code>.
            </p>
            {settings?.canEditOpenAiOAuthConfig ? (
              <>
                <label>
                  <span>Dev client ID override</span>
                  <input
                    autoComplete="off"
                    disabled={settingsPending}
                    onChange={(event) => {
                      updateSettingsDraft(
                        { openAiOAuthClientId: event.target.value },
                        { dirty: true },
                      )
                    }}
                    placeholder="app_..."
                    type="text"
                    value={openAiOAuthClientIdValue}
                  />
                </label>
                <label>
                  <span>Dev client secret override</span>
                  <input
                    autoComplete="off"
                    disabled={settingsPending}
                    onChange={(event) => {
                      updateSettingsDraft(
                        { openAiOAuthClientSecret: event.target.value },
                        { dirty: true },
                      )
                    }}
                    placeholder={
                      settings?.hasOpenAiOAuthClientSecret
                        ? 'Stored secret present. Enter a new value to replace it.'
                        : 'Optional client secret'
                    }
                    type="password"
                    value={openAiOAuthClientSecretValue}
                  />
                </label>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="cbv-agent-actions">
        {authModeValue === 'api_key' ? (
          <button
            className="is-secondary"
            disabled={settingsPending || !settings?.hasApiKey}
            onClick={() => {
              void handleClearApiKey()
            }}
            type="button"
          >
            Remove Key
          </button>
        ) : null}
        {authModeValue === 'brokered_oauth' ? (
          <>
            <button
              className="is-secondary"
              disabled={settingsPending || settings?.brokerSession.state === 'signed_out'}
              onClick={() => {
                void handleBrokeredLogout()
              }}
              type="button"
            >
              Sign Out
            </button>
            {settings?.canEditOpenAiOAuthConfig ? (
              <button
                className="is-secondary"
                disabled={
                  settingsPending ||
                  (!settings.hasOpenAiOAuthClientId && !settings.hasOpenAiOAuthClientSecret)
                }
                onClick={() => {
                  void handleClearOpenAiOAuthOverride()
                }}
                type="button"
              >
                Clear OAuth Override
              </button>
            ) : null}
            <button
              className="is-secondary"
              disabled={settingsPending}
              onClick={() => {
                void handleImportCodexLogin()
              }}
              type="button"
            >
              Use Codex Login
            </button>
            <button
              className="is-secondary"
              disabled={settingsPending || manualRedirectUrlValue.trim().length === 0}
              onClick={() => {
                void handleCompleteManualRedirect()
              }}
              type="button"
            >
              Complete Sign-In
            </button>
            <button
              onClick={() => {
                void handleStartBrokeredLogin()
              }}
              type="button"
            >
              Sign In With OpenAI
            </button>
          </>
        ) : (
          <button
            disabled={settingsPending || !providerValue || !modelValue}
            onClick={() => {
              void handleSaveSettings()
            }}
            type="button"
          >
            {settingsPending ? 'Saving…' : 'Save Settings'}
          </button>
        )}
      </div>
    </section>
  )
}

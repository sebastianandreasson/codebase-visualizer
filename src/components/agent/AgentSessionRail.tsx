import type { AgentSessionListItem, AgentSessionSummary } from '../../schema/agent'

interface AgentSessionRailProps {
  activeSession: AgentSessionSummary | null
  busy: boolean
  deleteAvailable: boolean
  errorMessage: string | null
  newAvailable: boolean
  onDeleteSession: (session: AgentSessionListItem) => void | Promise<void>
  onNewSession: () => void | Promise<void>
  onResumeSession: (session: AgentSessionListItem) => void | Promise<void>
  pendingSessionPath: string | null
  resumeAvailable: boolean
  sessions: AgentSessionListItem[]
  sessionsPending: boolean
}

export function AgentSessionRail({
  activeSession,
  busy,
  deleteAvailable,
  errorMessage,
  newAvailable,
  onDeleteSession,
  onNewSession,
  onResumeSession,
  pendingSessionPath,
  resumeAvailable,
  sessions,
  sessionsPending,
}: AgentSessionRailProps) {
  const activeSessionFile = activeSession?.sessionFile ?? null
  const activeSessionIsSaved = Boolean(
    activeSessionFile &&
    sessions.some((session) => session.path === activeSessionFile),
  )

  return (
    <aside className="cbv-agent-session-rail" aria-label="Chat sessions">
      <div className={`cbv-agent-session-list${!activeSessionIsSaved && activeSession ? ' has-current' : ''}`}>
        {!activeSessionIsSaved && activeSession ? (
          <div className="cbv-agent-session-current">
            <strong>{activeSession.sessionName ?? abbreviateSessionId(activeSession.id)}</strong>
            <small>{activeSession.sessionFile ? 'current' : activeSession.runState}</small>
          </div>
        ) : null}

        <div className="cbv-agent-session-tabs">
          {sessions.map((session) => {
            const title = formatSessionTitle(session)
            const isActive = Boolean(activeSessionFile && session.path === activeSessionFile)
            const actionPending = pendingSessionPath === session.path
            const deleteDisabled = busy || actionPending || (isActive && activeSession?.runState === 'running')

            return (
              <div
                className={[
                  'cbv-agent-session-tab-row',
                  isActive ? 'is-active' : '',
                  actionPending ? 'is-pending' : '',
                ].filter(Boolean).join(' ')}
                key={session.path}
              >
                <button
                  aria-current={isActive ? 'true' : undefined}
                  className="cbv-agent-session-tab"
                  disabled={busy || actionPending || isActive || !resumeAvailable}
                  onClick={() => {
                    void onResumeSession(session)
                  }}
                  title={session.path}
                  type="button"
                >
                  <span>{title}</span>
                  <small>{formatSessionMeta(session)}</small>
                </button>
                <button
                  aria-label={`Delete ${title}`}
                  className="cbv-agent-session-delete"
                  disabled={!deleteAvailable || deleteDisabled}
                  onClick={() => {
                    void onDeleteSession(session)
                  }}
                  title={`Delete ${title}`}
                  type="button"
                >
                  x
                </button>
              </div>
            )
          })}
          {sessions.length === 0 ? (
            <p className="cbv-agent-session-empty">
              {sessionsPending ? 'loading' : 'no saved sessions'}
            </p>
          ) : null}
        </div>
      </div>

      {errorMessage ? <p className="cbv-agent-session-error">{errorMessage}</p> : null}
      <button
        className="cbv-agent-session-new"
        disabled={busy || !newAvailable}
        onClick={() => {
          void onNewSession()
        }}
        title="New chat session"
        type="button"
      >
        + new session
      </button>
    </aside>
  )
}

function formatSessionTitle(session: AgentSessionListItem) {
  return session.name?.trim() || firstLine(session.preview) || session.id
}

function formatSessionMeta(session: AgentSessionListItem) {
  return formatSessionDate(session.modifiedAt) ?? ''
}

function formatSessionDate(value: string) {
  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp).toLocaleString([], {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  })
}

function firstLine(value: string) {
  return value.trim().split(/\n+/)[0]?.trim() ?? ''
}

function abbreviateSessionId(id: string) {
  return id.length > 10 ? id.slice(0, 10) : id
}

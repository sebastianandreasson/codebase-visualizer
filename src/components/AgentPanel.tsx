import { useEffect, useMemo, useRef, useState } from 'react'

import { DesktopAgentClient } from '../agent/DesktopAgentClient'
import type { AgentEvent, AgentMessage, AgentSessionSummary } from '../schema/agent'

export function AgentPanel() {
  const agentClient = useMemo(() => new DesktopAgentClient(), [])
  const [composerValue, setComposerValue] = useState('')
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [session, setSession] = useState<AgentSessionSummary | null>(null)
  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!agentClient.isAvailable()) {
      return
    }

    let cancelled = false
    const unsubscribe = agentClient.subscribe((event) => {
      if (cancelled) {
        return
      }

      handleAgentEvent(event, setMessages, setSession)
    })

    void agentClient.createSession().then((nextSession) => {
      if (cancelled || !nextSession) {
        return
      }

      setSession(nextSession)
    }).catch((error) => {
      if (cancelled) {
        return
      }

      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to initialize the agent session.',
      )
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [agentClient])

  useEffect(() => {
    if (!messageListRef.current) {
      return
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight
  }, [messages])

  async function handleSubmit() {
    const nextPrompt = composerValue.trim()

    if (!nextPrompt || pending) {
      return
    }

    try {
      setPending(true)
      setErrorMessage(null)
      const ok = await agentClient.sendMessage(nextPrompt)

      if (!ok) {
        throw new Error('No active desktop agent session is available.')
      }

      setComposerValue('')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to send the prompt to the agent.',
      )
    } finally {
      setPending(false)
    }
  }

  async function handleCancel() {
    try {
      setErrorMessage(null)
      await agentClient.cancel()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to cancel the active run.',
      )
    }
  }

  if (!agentClient.isAvailable()) {
    return (
      <div className="cbv-agent-panel">
        <div className="cbv-empty">
          <h2>Agent unavailable</h2>
          <p>The embedded PI runtime is only available in the desktop host.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cbv-agent-panel">
      <div className="cbv-agent-meta">
        <div>
          <p className="cbv-eyebrow">Session</p>
          <strong>
            {session ? `${session.provider}/${session.modelId}` : 'Starting…'}
          </strong>
        </div>
        <div className={`cbv-agent-status is-${session?.runState ?? 'idle'}`}>
          {session?.runState ?? 'idle'}
        </div>
      </div>

      {session?.lastError ? (
        <p className="cbv-agent-warning">{session.lastError}</p>
      ) : null}

      {errorMessage ? (
        <p className="cbv-agent-error">{errorMessage}</p>
      ) : null}

      <div className="cbv-agent-messages" ref={messageListRef}>
        {messages.length ? (
          messages.map((message) => (
            <article
              className={`cbv-agent-message is-${message.role}`}
              key={message.id}
            >
              <header>
                <strong>{message.role}</strong>
                {message.isStreaming ? <span>streaming</span> : null}
              </header>
              <div className="cbv-agent-message-body">
                {message.blocks.length ? (
                  message.blocks.map((block, index) => (
                    <p key={`${message.id}:${block.kind}:${index}`}>{block.text || ' '}</p>
                  ))
                ) : (
                  <p>{message.role === 'assistant' ? '…' : ''}</p>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="cbv-empty">
            <h2>No agent messages yet</h2>
            <p>Send a prompt to the embedded PI runtime from here.</p>
          </div>
        )}
      </div>

      <div className="cbv-agent-composer">
        <textarea
          onChange={(event) => setComposerValue(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder="Ask about this repository or request a change…"
          rows={4}
          value={composerValue}
        />
        <div className="cbv-agent-actions">
          <button
            className="is-secondary"
            disabled={session?.runState !== 'running'}
            onClick={() => {
              void handleCancel()
            }}
            type="button"
          >
            Cancel
          </button>
          <button
            disabled={pending || composerValue.trim().length === 0}
            onClick={() => {
              void handleSubmit()
            }}
            type="button"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function handleAgentEvent(
  event: AgentEvent,
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>,
  setSession: React.Dispatch<React.SetStateAction<AgentSessionSummary | null>>,
) {
  switch (event.type) {
    case 'session_created':
    case 'session_updated':
      setSession(event.session)
      break

    case 'message':
      setMessages((messages) => upsertMessage(messages, event.message))
      break

    case 'tool':
    case 'permission_request':
      break
  }
}

function upsertMessage(messages: AgentMessage[], nextMessage: AgentMessage) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id)

  if (existingIndex === -1) {
    return [...messages, nextMessage]
  }

  return messages.map((message, index) =>
    index === existingIndex ? nextMessage : message,
  )
}


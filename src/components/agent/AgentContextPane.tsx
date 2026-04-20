import { useEffect, useMemo, useState } from 'react'

import { DesktopAgentClient } from '../../agent/DesktopAgentClient'
import {
  areScopeContextsEquivalent,
  describeInspectorContext,
  describeScopeContextTitle,
  hasScopeContext,
  type AgentScopeContext,
} from '../../agent/agentScopeContext'
import type { AgentSessionSummary } from '../../schema/agent'
import type { LayoutDraft, WorkingSetState, WorkspaceProfile } from '../../types'
import {
  AgentScopeContextList,
  AgentScopeContextOverflow,
} from './AgentScopeContextView'

interface AgentContextPaneProps {
  activeDraft?: LayoutDraft | null
  draftActionError?: string | null
  inspectorContext?: AgentScopeContext
  layoutActionsPending?: boolean
  layoutSyncNote?: {
    label: string
    title: string
  } | null
  onAdoptInspectorContextAsWorkingSet?: () => void
  onAcceptDraft?: () => void | Promise<void>
  onClearWorkingSet?: () => void
  onOpenDrawer?: () => void
  onOpenSettings?: () => void
  onRejectDraft?: () => void | Promise<void>
  workingSet?: WorkingSetState | null
  workingSetContext?: AgentScopeContext | null
  workspaceProfile?: WorkspaceProfile | null
}

export function AgentContextPane({
  activeDraft = null,
  draftActionError = null,
  inspectorContext,
  layoutActionsPending = false,
  layoutSyncNote = null,
  onAdoptInspectorContextAsWorkingSet,
  onAcceptDraft,
  onClearWorkingSet,
  onOpenDrawer,
  onOpenSettings,
  onRejectDraft,
  workingSet = null,
  workingSetContext = null,
  workspaceProfile = null,
}: AgentContextPaneProps) {
  const agentClient = useMemo(() => new DesktopAgentClient(), [])
  const [session, setSession] = useState<AgentSessionSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const syncSession = async () => {
      try {
        const state = await agentClient.getHttpState()

        if (!cancelled) {
          setSession(state?.session ?? null)
          setErrorMessage(null)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to read agent session state.',
          )
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void syncSession()
    }, 1000)

    void syncSession()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [agentClient])

  const hasInspectorContext = hasScopeContext(inspectorContext)
  const hasWorkingSetContext = hasScopeContext(workingSetContext)
  const workingSetMatchesInspectorContext =
    hasWorkingSetContext && hasInspectorContext
      ? areScopeContextsEquivalent(workingSetContext, inspectorContext)
      : false

  return (
    <div className="cbv-agent-context-pane">
      {activeDraft ? (
        <section className="cbv-agent-context-card is-draft">
          <div className="cbv-agent-context-card-header">
            <div>
              <p className="cbv-eyebrow">Draft Layout</p>
              <strong>{activeDraft.layout?.title ?? activeDraft.id}</strong>
            </div>
          </div>
          <p className="cbv-agent-context-copy">
            {activeDraft.proposalEnvelope.rationale}
          </p>
          {layoutSyncNote ? (
            <p className="cbv-agent-context-copy" title={layoutSyncNote.title}>
              {layoutSyncNote.label}
            </p>
          ) : null}
          {activeDraft.proposalEnvelope.warnings[0] ? (
            <p className="cbv-agent-warning">
              {activeDraft.proposalEnvelope.warnings[0]}
            </p>
          ) : null}
          {draftActionError ? <p className="cbv-agent-error">{draftActionError}</p> : null}
          <div className="cbv-agent-context-actions">
            <button
              disabled={layoutActionsPending || !onAcceptDraft}
              onClick={() => {
                void onAcceptDraft?.()
              }}
              type="button"
            >
              Accept Draft
            </button>
            <button
              className="is-secondary"
              disabled={layoutActionsPending || !onRejectDraft}
              onClick={() => {
                void onRejectDraft?.()
              }}
              type="button"
            >
              Reject Draft
            </button>
          </div>
        </section>
      ) : null}

      <section className="cbv-agent-context-card">
        <div className="cbv-agent-context-card-header">
          <div>
            <p className="cbv-eyebrow">Session</p>
            <strong>
              {session ? `${session.provider}/${session.modelId}` : 'No active session'}
            </strong>
          </div>
          <div className={`cbv-agent-status is-${session?.runState ?? 'idle'}`}>
            {session?.runState ?? 'idle'}
          </div>
        </div>
        <p className="cbv-agent-context-copy">
          {workspaceProfile?.summary ??
            'The bottom drawer is the primary place to chat with the embedded agent.'}
        </p>
        <div className="cbv-agent-context-actions">
          {onOpenDrawer ? (
            <button onClick={onOpenDrawer} type="button">
              Open Drawer
            </button>
          ) : null}
          {onOpenSettings ? (
            <button className="is-secondary" onClick={onOpenSettings} type="button">
              Settings
            </button>
          ) : null}
        </div>
        {session?.lastError ? <p className="cbv-agent-warning">{session.lastError}</p> : null}
        {errorMessage ? <p className="cbv-agent-error">{errorMessage}</p> : null}
      </section>

      {hasWorkingSetContext ? (
        <section className="cbv-agent-context-card">
          <p className="cbv-eyebrow">Pinned working set</p>
          <strong>{describeScopeContextTitle(workingSetContext)}</strong>
          <p className="cbv-agent-context-copy">
            Agent requests will start from this working set and only leave it when blocked.
            {workingSet?.source === 'selection' ? ' Pinned from selection.' : ''}
          </p>
          <AgentScopeContextList context={workingSetContext} />
          <AgentScopeContextOverflow context={workingSetContext} />
          <div className="cbv-agent-context-actions">
            {hasInspectorContext &&
            !workingSetMatchesInspectorContext &&
            onAdoptInspectorContextAsWorkingSet ? (
              <button onClick={onAdoptInspectorContextAsWorkingSet} type="button">
                Replace With Selection
              </button>
            ) : null}
            {onClearWorkingSet ? (
              <button className="is-secondary" onClick={onClearWorkingSet} type="button">
                Clear Working Set
              </button>
            ) : null}
          </div>
        </section>
      ) : hasInspectorContext ? (
        <section className="cbv-agent-context-card">
          <p className="cbv-eyebrow">Current selection</p>
          <strong>{describeScopeContextTitle(inspectorContext)}</strong>
          <p className="cbv-agent-context-copy">{describeInspectorContext(inspectorContext)}</p>
          <AgentScopeContextList context={inspectorContext} />
          <AgentScopeContextOverflow context={inspectorContext} />
          {onAdoptInspectorContextAsWorkingSet ? (
            <div className="cbv-agent-context-actions">
              <button onClick={onAdoptInspectorContextAsWorkingSet} type="button">
                Use As Working Set
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

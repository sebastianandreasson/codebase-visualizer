import { useMemo, useState } from 'react'

import type {
  AutonomousRunSummary,
  PreprocessedWorkspaceContext,
  PreprocessingStatus,
  WorkspaceProfile,
  WorkingSetState,
} from '../../types'
import { AgentPanel, type AgentScopeContext } from '../AgentPanel'

type AgentDrawerTab = 'agent' | 'activity' | 'runs'

interface AgentDrawerProps {
  activeRunId: string | null
  activeTab: AgentDrawerTab
  autonomousRuns: AutonomousRunSummary[]
  desktopHostAvailable?: boolean
  inspectorContext?: AgentScopeContext
  onAdoptInspectorContextAsWorkingSet?: () => void
  onChangeTab: (tab: AgentDrawerTab) => void
  onClearWorkingSet?: () => void
  onOpenRunsPanel?: () => void
  onOpenSettings?: () => void
  onRunSettled?: () => Promise<void>
  onToggleOpen: () => void
  open: boolean
  preprocessingStatus?: PreprocessingStatus | null
  preprocessedWorkspaceContext?: PreprocessedWorkspaceContext | null
  trailLabel?: string | null
  workingSet?: WorkingSetState | null
  workingSetContext?: AgentScopeContext | null
  workspaceProfile?: WorkspaceProfile | null
}

export function AgentDrawer({
  activeRunId,
  activeTab,
  autonomousRuns,
  desktopHostAvailable = false,
  inspectorContext,
  onAdoptInspectorContextAsWorkingSet,
  onChangeTab,
  onClearWorkingSet,
  onOpenRunsPanel,
  onOpenSettings,
  onRunSettled,
  onToggleOpen,
  open,
  preprocessingStatus = null,
  preprocessedWorkspaceContext = null,
  trailLabel = null,
  workingSet = null,
  workingSetContext = null,
  workspaceProfile = null,
}: AgentDrawerProps) {
  const activeRun = useMemo(
    () => autonomousRuns.find((run) => run.runId === activeRunId) ?? null,
    [activeRunId, autonomousRuns],
  )
  const [stripValue, setStripValue] = useState('')
  const [promptSeed, setPromptSeed] = useState<{ id: string; value: string } | null>(null)

  function ensureOpen() {
    if (!open) {
      onToggleOpen()
    }
  }

  function handlePromoteComposer() {
    const nextPrompt = stripValue.trim()
    onChangeTab('agent')
    ensureOpen()

    if (nextPrompt) {
      setPromptSeed({
        id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
        value: nextPrompt,
      })
      setStripValue('')
    }
  }

  const stripStatus = activeRun ? 'running' : 'idle'
  const stripTrail = trailLabel?.trim() || 'idle'

  return (
    <section className={`cbv-agent-drawer${open ? ' is-open' : ' is-collapsed'}`}>
      <div className="cbv-agent-strip">
        <span className={`cbv-agent-strip-dot is-${stripStatus}`} />
        <span className="cbv-agent-strip-label">agent</span>
        <span className="cbv-agent-strip-trail" title={stripTrail}>
          following · {stripTrail}
        </span>
        <input
          className="cbv-agent-strip-input"
          onChange={(event) => setStripValue(event.target.value)}
          onFocus={() => {
            onChangeTab('agent')
            ensureOpen()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handlePromoteComposer()
            }
          }}
          placeholder="ask agent"
          type="text"
          value={stripValue}
        />
        <button
          className="cbv-agent-strip-submit"
          onClick={handlePromoteComposer}
          title="Open agent composer"
          type="button"
        >
          ↵
        </button>
        <button
          aria-expanded={open}
          className="cbv-agent-strip-toggle"
          onClick={() => {
            onChangeTab('agent')
            onToggleOpen()
          }}
          type="button"
        >
          {open ? '⑂' : '⌘K'}
        </button>
      </div>

      {open ? (
        <div className="cbv-agent-drawer-body">
          <div className="cbv-agent-drawer-header">
            <div className="cbv-agent-drawer-tabs" role="tablist" aria-label="Agent drawer">
              {([
                { id: 'agent', label: 'Agent' },
                { id: 'activity', label: 'Activity' },
                { id: 'runs', label: 'Runs' },
              ] as const).map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'is-active' : ''}
                  key={tab.id}
                  onClick={() => onChangeTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="cbv-agent-drawer-actions">
              {onOpenSettings ? (
                <button className="cbv-toolbar-button is-secondary" onClick={onOpenSettings} type="button">
                  Settings
                </button>
              ) : null}
              <button
                aria-expanded={open}
                className="cbv-toolbar-button is-secondary"
                onClick={onToggleOpen}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
          {activeTab === 'agent' ? (
            <AgentPanel
              autoFocusComposer
              desktopHostAvailable={desktopHostAvailable}
              inspectorContext={inspectorContext}
              onAdoptInspectorContextAsWorkingSet={onAdoptInspectorContextAsWorkingSet}
              onClearWorkingSet={onClearWorkingSet}
              onOpenSettings={onOpenSettings}
              onRunSettled={onRunSettled}
              preprocessedWorkspaceContext={preprocessedWorkspaceContext}
              promptSeed={promptSeed}
              workingSet={workingSet}
              workingSetContext={workingSetContext}
              workspaceProfile={workspaceProfile}
            />
          ) : activeTab === 'activity' ? (
            <div className="cbv-agent-drawer-panel">
              <div className="cbv-agent-drawer-grid">
                <section className="cbv-agent-context-card">
                  <p className="cbv-eyebrow">Workspace</p>
                  <strong>{workspaceProfile?.rootDir ?? 'Unknown workspace'}</strong>
                  <p className="cbv-agent-context-copy">
                    {workspaceProfile?.summary ??
                      'Agent activity, follow-agent flows, and preprocessing status are centered in this drawer.'}
                  </p>
                </section>
                <section className="cbv-agent-context-card">
                  <p className="cbv-eyebrow">Preprocessing</p>
                  <strong>{formatPreprocessingHeadline(preprocessingStatus)}</strong>
                  <p className="cbv-agent-context-copy">
                    {formatPreprocessingBody(preprocessingStatus)}
                  </p>
                  {preprocessingStatus?.currentItemPath ? (
                    <p className="cbv-agent-context-more" title={preprocessingStatus.currentItemPath}>
                      Current: {preprocessingStatus.currentItemPath}
                    </p>
                  ) : null}
                </section>
              </div>
            </div>
          ) : (
            <div className="cbv-agent-drawer-panel">
              <div className="cbv-agent-drawer-runs">
                <div className="cbv-agent-context-card">
                  <p className="cbv-eyebrow">Runs</p>
                  <strong>
                    {autonomousRuns.length} run{autonomousRuns.length === 1 ? '' : 's'}
                  </strong>
                  <p className="cbv-agent-context-copy">
                    {activeRun
                      ? `Active run: ${activeRun.task || activeRun.runId}`
                      : 'No active autonomous run at the moment.'}
                  </p>
                  {onOpenRunsPanel ? (
                    <div className="cbv-agent-context-actions">
                      <button onClick={onOpenRunsPanel} type="button">
                        Open Runs Panel
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="cbv-agent-drawer-run-list">
                  {autonomousRuns.length ? (
                    autonomousRuns.slice(0, 8).map((run) => (
                      <article className="cbv-agent-drawer-run" key={run.runId}>
                        <header>
                          <strong>{run.task || run.runId}</strong>
                          <span className={`cbv-agent-status is-${mapRunStatusToAgentStatus(run.status)}`}>
                            {run.status}
                          </span>
                        </header>
                        <p>{run.taskFile ?? 'No task file detected.'}</p>
                      </article>
                    ))
                  ) : (
                    <p className="cbv-projects-empty">No autonomous runs recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="cbv-agent-drawer-collapsed">
          <span>Persistent composer strip. Press ⌘K or focus input to expand.</span>
        </div>
      )}
    </section>
  )
}

function formatPreprocessingHeadline(preprocessingStatus: PreprocessingStatus | null) {
  if (!preprocessingStatus) {
    return 'No preprocessing activity'
  }

  if (preprocessingStatus.runState === 'building') {
    return preprocessingStatus.activity === 'embeddings'
      ? 'Building embeddings'
      : 'Building summaries'
  }

  if (preprocessingStatus.runState === 'ready') {
    return `${preprocessingStatus.purposeSummaryCount} summaries ready`
  }

  if (preprocessingStatus.runState === 'stale') {
    return 'Workspace changed'
  }

  if (preprocessingStatus.runState === 'error') {
    return 'Preprocessing failed'
  }

  return 'Idle'
}

function formatPreprocessingBody(preprocessingStatus: PreprocessingStatus | null) {
  if (!preprocessingStatus) {
    return 'No semantic preprocessing has been loaded yet.'
  }

  if (preprocessingStatus.runState === 'building') {
    return `Processed ${preprocessingStatus.processedSymbols}/${preprocessingStatus.totalSymbols} symbols so far.`
  }

  if (preprocessingStatus.runState === 'ready') {
    return `${preprocessingStatus.semanticEmbeddingCount} embeddings built from cached summaries.`
  }

  if (preprocessingStatus.runState === 'stale') {
    return 'The repo changed since the last preprocessing run; summaries or embeddings may be out of date.'
  }

  if (preprocessingStatus.runState === 'error') {
    return preprocessingStatus.lastError ?? 'Preprocessing reported an unknown error.'
  }

  return 'Run summaries or embeddings from the toolbar when you need refreshed semantic context.'
}

function mapRunStatusToAgentStatus(status: AutonomousRunSummary['status']) {
  switch (status) {
    case 'running':
      return 'running'
    case 'completed':
      return 'ready'
    case 'failed':
      return 'error'
    default:
      return 'idle'
  }
}

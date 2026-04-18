interface LayoutOption {
  label: string
  value: string
}

interface WorkspaceToolbarProps {
  agentDrawerOpen?: boolean
  activeDraft: boolean
  activeLayoutSyncNote?: {
    label: string
    title: string
  } | null
  compareOverlayActive: boolean
  layoutActionsPending: boolean
  layoutOptions: LayoutOption[]
  onAcceptDraft?: () => void | Promise<void>
  onActivateCompareOverlay?: () => void
  onBuildSemanticEmbeddings?: () => void
  onClearCompareOverlay?: () => void
  onOpenAgentDrawer?: () => void
  onOpenAgentSettings: () => void
  onOpenRunsPanel?: () => void
  onRejectDraft?: () => void | Promise<void>
  onSelectLayoutValue: (value: string) => void
  onStartPreprocessing?: () => void
  onToggleProjectsSidebar?: () => void
  preprocessingStatus?: {
    canBuildEmbeddings: boolean
    currentItemPath?: string | null
    embeddingActionLabel: string
    label: string
    lastError?: string | null
    preprocessingActionLabel: string
    progressPercent: number
    runState: string
    title: string
    workspaceSync?: {
      isOutdated: boolean
      label: string
      title: string
    } | null
  } | null
  onOpenWorkspaceSync?: () => void
  projectsSidebarOpen: boolean
  runsActive?: boolean
  selectedLayoutValue: string
  showCompareAction: boolean
  workingSetSummary?: {
    label: string
    title: string
  } | null
  workspaceName: string
  workspaceRootDir: string
}

export function WorkspaceToolbar({
  agentDrawerOpen = false,
  activeDraft,
  activeLayoutSyncNote = null,
  compareOverlayActive,
  layoutActionsPending,
  layoutOptions,
  onAcceptDraft,
  onActivateCompareOverlay,
  onBuildSemanticEmbeddings,
  onClearCompareOverlay,
  onOpenAgentDrawer,
  onOpenAgentSettings,
  onOpenRunsPanel,
  onOpenWorkspaceSync,
  onRejectDraft,
  onSelectLayoutValue,
  onStartPreprocessing,
  onToggleProjectsSidebar,
  preprocessingStatus = null,
  projectsSidebarOpen,
  runsActive = false,
  selectedLayoutValue,
  showCompareAction,
  workingSetSummary = null,
  workspaceName,
  workspaceRootDir,
}: WorkspaceToolbarProps) {
  const preprocessingBusy = preprocessingStatus?.runState === 'building'
  const preprocessingTone =
    preprocessingStatus?.runState === 'error'
      ? 'error'
      : preprocessingBusy
        ? 'running'
        : preprocessingStatus?.runState === 'ready'
          ? 'ready'
          : preprocessingStatus?.runState === 'stale'
            ? 'stale'
            : 'idle'

  return (
    <header className="cbv-toolbar">
      <div className="cbv-toolbar-brand">
        <span aria-hidden="true" className="cbv-brand-mark">
          <span />
        </span>
        <div className="cbv-toolbar-workspace">
          <div className="cbv-toolbar-eyebrow-row">
            <span className="cbv-eyebrow">Semanticode</span>
            {workingSetSummary ? (
              <div className="cbv-working-set-chip" title={workingSetSummary.title}>
                <span className="cbv-working-set-chip-dot" />
                <span>{workingSetSummary.label}</span>
              </div>
            ) : null}
          </div>
          <div className="cbv-workspace-summary">
            <strong>{workspaceName}</strong>
            <p className="cbv-toolbar-path" title={workspaceRootDir}>
              {workspaceRootDir}
            </p>
          </div>
        </div>
      </div>

      <div className="cbv-toolbar-center">
        <div className="cbv-layout-controls">
          <label className="cbv-layout-picker">
            <span className="cbv-eyebrow">
              <span className="cbv-layout-picker-dot" />
              Scene
            </span>
            <select
              onChange={(event) => {
                onSelectLayoutValue(event.target.value)
              }}
              value={selectedLayoutValue}
            >
              {layoutOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {activeLayoutSyncNote ? (
            <p className="cbv-layout-sync-note" title={activeLayoutSyncNote.title}>
              {activeLayoutSyncNote.label}
            </p>
          ) : null}
        </div>
      </div>

      <div className="cbv-toolbar-right">
        {preprocessingStatus ? (
          <div className="cbv-toolbar-status-cluster">
            <div
              className={`cbv-toolbar-status is-${preprocessingTone}`}
              title={preprocessingStatus.title}
            >
              <span className="cbv-toolbar-status-dot" />
              <span>{preprocessingStatus.label}</span>
            </div>
            {preprocessingStatus.workspaceSync ? (
              <button
                className={`cbv-toolbar-meta-button${preprocessingStatus.workspaceSync.isOutdated ? ' is-outdated' : ''}`}
                onClick={onOpenWorkspaceSync}
                title={preprocessingStatus.workspaceSync.title}
                type="button"
              >
                {preprocessingStatus.workspaceSync.label}
              </button>
            ) : null}
            {onStartPreprocessing ? (
              <button
                className="cbv-toolbar-meta-button"
                disabled={preprocessingBusy}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onStartPreprocessing()
                }}
                title="Use the agent to generate semantic purpose summaries."
                type="button"
              >
                {preprocessingStatus.preprocessingActionLabel}
              </button>
            ) : null}
            {onBuildSemanticEmbeddings ? (
              <button
                className="cbv-toolbar-meta-button"
                disabled={preprocessingBusy || !preprocessingStatus.canBuildEmbeddings}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onBuildSemanticEmbeddings()
                }}
                title="Build local semantic embeddings from cached summaries."
                type="button"
              >
                {preprocessingStatus.embeddingActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        {activeDraft ? (
          <div className="cbv-draft-actions">
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
              className="is-danger"
              disabled={layoutActionsPending || !onRejectDraft}
              onClick={() => {
                void onRejectDraft?.()
              }}
              type="button"
            >
              Reject Draft
            </button>
          </div>
        ) : null}
        {showCompareAction ? (
          <div className="cbv-compare-actions">
            <button
              className={`cbv-toolbar-button${compareOverlayActive ? ' is-active' : ''}`}
              onClick={onActivateCompareOverlay}
              type="button"
            >
              {compareOverlayActive
                ? 'Comparing in Semantic View'
                : 'Compare in Semantic View'}
            </button>
            {compareOverlayActive ? (
              <button
                className="cbv-toolbar-button is-secondary"
                onClick={onClearCompareOverlay}
                type="button"
              >
                Clear Compare
              </button>
            ) : null}
          </div>
        ) : null}
        {onToggleProjectsSidebar ? (
          <button
            className={`cbv-toolbar-button is-secondary${projectsSidebarOpen ? ' is-active' : ''}`}
            onClick={onToggleProjectsSidebar}
            type="button"
          >
            {projectsSidebarOpen ? 'Hide Outline' : 'Outline'}
          </button>
        ) : null}
        {onOpenAgentDrawer ? (
          <button
            className={`cbv-toolbar-button is-secondary${agentDrawerOpen ? ' is-active' : ''}`}
            onClick={onOpenAgentDrawer}
            type="button"
          >
            Agent
          </button>
        ) : null}
        {onOpenRunsPanel ? (
          <button
            className={`cbv-toolbar-button is-secondary${runsActive ? ' is-active' : ''}`}
            onClick={onOpenRunsPanel}
            type="button"
          >
            Runs
          </button>
        ) : null}
        <button
          aria-label="Settings"
          className="cbv-toolbar-icon-button"
          onClick={onOpenAgentSettings}
          title="Settings"
          type="button"
        >
          cfg
        </button>
        <span className="cbv-toolbar-shortcut">⌘K</span>
      </div>
    </header>
  )
}

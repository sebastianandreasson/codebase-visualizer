interface LayoutOption {
  label: string
  value: string
}

interface WorkspaceToolbarProps {
  agentDrawerOpen?: boolean
  layoutOptions: LayoutOption[]
  onOpenAgentDrawer?: () => void
  onOpenAgentSettings: () => void
  onOpenRunsPanel?: () => void
  onSelectLayoutValue: (value: string) => void
  onToggleProjectsSidebar?: () => void
  preprocessingStatus?: {
    label: string
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
  workingSetSummary?: {
    label: string
    title: string
  } | null
  workspaceName: string
  workspaceRootDir: string
}

export function WorkspaceToolbar({
  agentDrawerOpen = false,
  layoutOptions,
  onOpenAgentDrawer,
  onOpenAgentSettings,
  onOpenRunsPanel,
  onOpenWorkspaceSync,
  onSelectLayoutValue,
  onToggleProjectsSidebar,
  preprocessingStatus = null,
  projectsSidebarOpen,
  runsActive = false,
  selectedLayoutValue,
  workingSetSummary = null,
  workspaceName,
  workspaceRootDir,
}: WorkspaceToolbarProps) {
  const preprocessingTone =
    preprocessingStatus?.runState === 'error'
      ? 'error'
      : preprocessingStatus?.runState === 'building'
        ? 'running'
        : preprocessingStatus?.runState === 'ready'
          ? 'ready'
          : preprocessingStatus?.runState === 'stale'
            ? 'stale'
            : 'idle'

  return (
    <header className="cbv-toolbar">
      <div className="cbv-toolbar-brand">
        {onToggleProjectsSidebar ? (
          <button
            aria-label={projectsSidebarOpen ? 'Hide outline' : 'Show outline'}
            className={`cbv-toolbar-rail-toggle${projectsSidebarOpen ? ' is-active' : ''}`}
            onClick={onToggleProjectsSidebar}
            title={projectsSidebarOpen ? 'Hide outline' : 'Show outline'}
            type="button"
          >
            <span aria-hidden="true">{projectsSidebarOpen ? '▾' : '▸'}</span>
            <span>outline</span>
          </button>
        ) : null}
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
          </div>
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
          className="cbv-toolbar-meta-button"
          onClick={onOpenAgentSettings}
          title="Settings"
          type="button"
        >
          Settings
        </button>
        <span className="cbv-toolbar-shortcut">⌘K</span>
      </div>
    </header>
  )
}

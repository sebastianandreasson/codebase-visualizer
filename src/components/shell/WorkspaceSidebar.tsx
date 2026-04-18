import { useMemo, useState, type CSSProperties } from 'react'

interface RecentProject {
  name: string
  rootDir: string
  lastOpenedAt: string
}

export interface WorkspaceSidebarGroupItem {
  id: string
  title: string
  subtitle: string
  badge?: string | null
  metric?: number | null
}

export interface WorkspaceSidebarGroup {
  id: string
  label: string
  metricLabel: string
  tone: string
  items: WorkspaceSidebarGroupItem[]
}

interface WorkspaceSidebarProps {
  canManageProjects: boolean
  currentRootDir: string
  groups: WorkspaceSidebarGroup[]
  onClose: () => void
  onCloseWorkspace: () => void
  onOpenRecentProject: (rootDir: string) => void
  onOpenWorkspace: () => void
  onSelectSymbol: (nodeId: string) => void
  open: boolean
  recentProjects: RecentProject[]
  selectedNodeId: string | null
  workspaceActionError?: string | null
  workspaceActionPending?: boolean
}

export function WorkspaceSidebar({
  canManageProjects,
  currentRootDir,
  groups,
  onClose,
  onCloseWorkspace,
  onOpenRecentProject,
  onOpenWorkspace,
  onSelectSymbol,
  open,
  recentProjects,
  selectedNodeId,
  workspaceActionError = null,
  workspaceActionPending = false,
}: WorkspaceSidebarProps) {
  const [filterValue, setFilterValue] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const normalizedFilter = filterValue.trim().toLowerCase()
  const totalVisibleSymbols = groups.reduce((count, group) => count + group.items.length, 0)
  const totalVisibleLoc = groups.reduce(
    (count, group) =>
      count + group.items.reduce((itemCount, item) => itemCount + (item.metric ?? 0), 0),
    0,
  )
  const currentWorkspaceName =
    currentRootDir.split('/').filter(Boolean).at(-1) ?? currentRootDir

  const filteredGroups = useMemo(() => {
    if (!normalizedFilter) {
      return groups
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = `${item.title}\n${item.subtitle}\n${item.badge ?? ''}`.toLowerCase()
          return haystack.includes(normalizedFilter)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, normalizedFilter])

  return (
    <aside className={`cbv-workspace-sidebar${open ? '' : ' is-collapsed'}`}>
      <div className="cbv-workspace-sidebar-header">
        <div className="cbv-workspace-sidebar-title">
          <p className="cbv-eyebrow">Workspace</p>
          <strong>{currentWorkspaceName}</strong>
          <span title={currentRootDir}>{currentRootDir}</span>
        </div>
        <button
          aria-label="Hide workspace sidebar"
          className="cbv-inspector-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      <section className="cbv-sidebar-section">
        <div className="cbv-sidebar-section-header">
          <span>Workspaces</span>
          <small>{recentProjects.length + 1}</small>
        </div>
        <div className="cbv-workspace-sidebar-actions">
          <button
            disabled={workspaceActionPending || !canManageProjects}
            onClick={onOpenWorkspace}
            type="button"
          >
            open folder
          </button>
          <button
            className="is-secondary"
            disabled={workspaceActionPending || !canManageProjects}
            onClick={onCloseWorkspace}
            type="button"
          >
            close current
          </button>
        </div>
        {recentProjects.length ? (
          <div className="cbv-workspace-recents">
            {recentProjects.slice(0, 4).map((project) => {
              const isActive = project.rootDir === currentRootDir

              return (
                <button
                  className={`cbv-workspace-recent-item${isActive ? ' is-active' : ''}`}
                  disabled={workspaceActionPending || isActive}
                  key={project.rootDir}
                  onClick={() => onOpenRecentProject(project.rootDir)}
                  type="button"
                >
                  <strong>{project.name}</strong>
                  <span title={project.rootDir}>{project.rootDir}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="cbv-projects-empty">No recent folders yet.</p>
        )}
      </section>

      <section className="cbv-sidebar-section cbv-sidebar-outline">
        <div className="cbv-sidebar-section-header">
          <span>Symbols · {filteredGroups.reduce((count, group) => count + group.items.length, 0)}</span>
          <small>sort: loc ▾</small>
        </div>
        <label className="cbv-sidebar-filter">
          <span className="cbv-sidebar-filter-icon">⌕</span>
          <input
            onChange={(event) => setFilterValue(event.target.value)}
            placeholder="Filter symbols"
            type="text"
            value={filterValue}
          />
        </label>
        <div className="cbv-workspace-outline">
          {filteredGroups.length ? (
            filteredGroups.map((group) => {
              const isCollapsed = Boolean(collapsedGroups[group.id])
              const maxMetric = Math.max(
                1,
                ...group.items.map((item) => item.metric ?? 0),
              )

              return (
                <section
                  className="cbv-outline-group"
                  key={group.id}
                  style={{ '--cbv-outline-tone': `var(${group.tone})` } as CSSProperties}
                >
                  <button
                    className="cbv-outline-group-header"
                    onClick={() =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.id]: !current[group.id],
                      }))
                    }
                    type="button"
                  >
                    <span className="cbv-outline-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="cbv-outline-group-dot" />
                    <span className="cbv-outline-group-title">{group.label}</span>
                    <span className="cbv-outline-group-meta">{group.metricLabel}</span>
                  </button>
                  {isCollapsed ? null : (
                    <div className="cbv-outline-group-items">
                      {group.items.map((item) => (
                        <button
                          className={`cbv-outline-item${selectedNodeId === item.id ? ' is-active' : ''}`}
                          key={item.id}
                          onClick={() => onSelectSymbol(item.id)}
                          type="button"
                        >
                          <span className="cbv-outline-item-main">
                            <strong>{item.title}</strong>
                            <span>{item.subtitle}</span>
                          </span>
                          <span className="cbv-outline-item-meta">
                            {item.badge ? (
                              <span className="cbv-outline-item-badge">{item.badge}</span>
                            ) : null}
                            <span className="cbv-outline-item-bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.max(18, Math.round(((item.metric ?? 0) / maxMetric) * 100))}%`,
                                }}
                              />
                            </span>
                            {typeof item.metric === 'number' ? (
                              <span className="cbv-outline-item-loc">{item.metric}</span>
                            ) : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )
            })
          ) : (
            <p className="cbv-projects-empty">No visible symbols match the current filter.</p>
          )}
        </div>
        <div className="cbv-sidebar-outline-footer">
          <span>≡ group · kind</span>
          <span>
            {totalVisibleSymbols} · {totalVisibleLoc} loc
          </span>
        </div>
      </section>

      {workspaceActionError ? <p className="cbv-workspace-error">{workspaceActionError}</p> : null}
    </aside>
  )
}

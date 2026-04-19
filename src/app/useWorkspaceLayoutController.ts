import { useEffect, useMemo } from 'react'

import { buildStructuralLayout } from '../layouts/structuralLayout'
import { buildSymbolLayout } from '../layouts/symbolLayout'
import { buildSemanticLayout } from '../semantic/semanticLayout'
import type {
  CanvasBaseScene,
  CodebaseSnapshot,
  LayoutDraft,
  LayoutCompareOverlayReference,
  LayoutSpec,
  OverlayFocusMode,
  PreprocessedWorkspaceContext,
  VisualizerViewMode,
  WorkspaceArtifactSyncStatus,
  WorkspaceUiState,
} from '../types'
import {
  canCompareLayoutAgainstSemantic,
  resolveCanvasScene,
  resolveLayoutCompareOverlay,
} from '../visualizer/canvasScene'
import {
  areLayoutListsEquivalent,
  getPreferredViewModeForLayout,
  mergeLayoutsWithDefaults,
} from '../visualizer/flowModel'

export interface UseWorkspaceLayoutControllerInput {
  activeDraftId: string | null
  activeLayoutId: string | null
  baseScene: CanvasBaseScene
  clearCompareOverlay: () => void
  compareOverlay: LayoutCompareOverlayReference | null
  draftLayouts: LayoutDraft[]
  layouts: LayoutSpec[]
  onClearDraftActionError: () => void
  overlayFocusMode: OverlayFocusMode
  overlayVisibility: boolean
  preprocessedWorkspaceContext: PreprocessedWorkspaceContext | null
  setActiveDraftId: (draftId: string | null) => void
  setActiveLayoutId: (layoutId: string | null) => void
  setBaseScene: (scene: CanvasBaseScene) => void
  setCompareOverlay: (overlay: LayoutCompareOverlayReference | null) => void
  setDraftLayouts: (draftLayouts: LayoutDraft[]) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTabToFile: () => void
  setLayouts: (layouts: LayoutSpec[]) => void
  setOverlayVisibility: (visible: boolean) => void
  setViewMode: (viewMode: VisualizerViewMode) => void
  setWorkspaceStateByRootDir: (
    updater: (state: Record<string, WorkspaceUiState>) => Record<string, WorkspaceUiState>,
  ) => void
  setWorkspaceViewResolvedRootDir: (rootDir: string | null) => void
  snapshot: CodebaseSnapshot | null | undefined
  uiPreferencesHydrated: boolean
  viewMode: VisualizerViewMode
  workspaceStateByRootDir: Record<string, WorkspaceUiState>
  workspaceSyncStatus: WorkspaceArtifactSyncStatus | null | undefined
  workspaceViewResolvedRootDir: string | null
}

export function useWorkspaceLayoutController({
  activeDraftId,
  activeLayoutId,
  baseScene,
  clearCompareOverlay,
  compareOverlay,
  draftLayouts,
  layouts,
  onClearDraftActionError,
  overlayFocusMode,
  overlayVisibility,
  preprocessedWorkspaceContext,
  setActiveDraftId,
  setActiveLayoutId,
  setBaseScene,
  setCompareOverlay,
  setDraftLayouts,
  setInspectorOpen,
  setInspectorTabToFile,
  setLayouts,
  setOverlayVisibility,
  setViewMode,
  setWorkspaceStateByRootDir,
  setWorkspaceViewResolvedRootDir,
  snapshot,
  uiPreferencesHydrated,
  viewMode,
  workspaceStateByRootDir,
  workspaceSyncStatus,
  workspaceViewResolvedRootDir,
}: UseWorkspaceLayoutControllerInput) {
  useEffect(() => {
    if (!snapshot?.rootDir) {
      setWorkspaceViewResolvedRootDir(null)
      return
    }

    if (!uiPreferencesHydrated) {
      setWorkspaceViewResolvedRootDir(null)
      return
    }

    if (!snapshot) {
      setDraftLayouts([])
      setLayouts([])
      setActiveDraftId(null)
      setActiveLayoutId(null)
      setWorkspaceViewResolvedRootDir(null)
      return
    }

    const structuralLayout = buildStructuralLayout(snapshot)
    const symbolLayout = buildSymbolLayout(snapshot)
    const semanticLayout = buildSemanticLayout(snapshot, preprocessedWorkspaceContext)
    const nextLayouts = mergeLayoutsWithDefaults(layouts, [
      structuralLayout,
      symbolLayout,
      semanticLayout,
    ])

    if (!areLayoutListsEquivalent(layouts, nextLayouts)) {
      setLayouts(nextLayouts)
    }

    const isResolvingWorkspaceView = workspaceViewResolvedRootDir !== snapshot.rootDir
    const rememberedWorkspaceState = workspaceStateByRootDir[snapshot.rootDir]
    const rememberedDraftId = rememberedWorkspaceState?.activeDraftId
    const rememberedLayoutId = rememberedWorkspaceState?.activeLayoutId

    if (isResolvingWorkspaceView) {
      if (
        rememberedDraftId &&
        draftLayouts.some(
          (draft) =>
            draft.id === rememberedDraftId && draft.layout && draft.status === 'draft',
        )
      ) {
        if (activeDraftId !== rememberedDraftId) {
          setActiveLayoutId(null)
          setActiveDraftId(rememberedDraftId)
          return
        }

        setWorkspaceViewResolvedRootDir(snapshot.rootDir)
        return
      }

      if (
        rememberedLayoutId &&
        nextLayouts.some((layout) => layout.id === rememberedLayoutId)
      ) {
        if (activeLayoutId !== rememberedLayoutId || activeDraftId) {
          setActiveDraftId(null)
          setActiveLayoutId(rememberedLayoutId)
          return
        }

        setWorkspaceViewResolvedRootDir(snapshot.rootDir)
        return
      }

      const defaultLayoutId =
        viewMode === 'symbols' ? symbolLayout.id : structuralLayout.id

      if (activeLayoutId !== defaultLayoutId || activeDraftId) {
        setActiveDraftId(null)
        setActiveLayoutId(defaultLayoutId)
        return
      }

      setWorkspaceViewResolvedRootDir(snapshot.rootDir)
      return
    }

    if (
      activeDraftId &&
      !draftLayouts.some(
        (draft) => draft.id === activeDraftId && draft.layout && draft.status === 'draft',
      )
    ) {
      setActiveDraftId(null)
      return
    }

    if (
      !activeDraftId &&
      activeLayoutId &&
      !nextLayouts.some((layout) => layout.id === activeLayoutId)
    ) {
      setActiveLayoutId(viewMode === 'symbols' ? symbolLayout.id : structuralLayout.id)
    }
  }, [
    activeDraftId,
    activeLayoutId,
    draftLayouts,
    layouts,
    preprocessedWorkspaceContext,
    setActiveDraftId,
    setActiveLayoutId,
    setDraftLayouts,
    setLayouts,
    setWorkspaceViewResolvedRootDir,
    snapshot,
    uiPreferencesHydrated,
    viewMode,
    workspaceStateByRootDir,
    workspaceViewResolvedRootDir,
  ])

  const availableDraftLayouts = draftLayouts.filter(
    (draft) => draft.layout && draft.status === 'draft',
  )
  const activeDraft =
    availableDraftLayouts.find((draft) => draft.id === activeDraftId) ?? null
  const selectedLayoutValue = activeDraft
    ? `draft:${activeDraft.id}`
    : activeLayoutId
      ? `layout:${activeLayoutId}`
      : ''
  const activeLayout =
    activeDraft?.layout ??
    layouts.find((layout) => layout.id === activeLayoutId) ??
    layouts[0] ??
    null
  const layoutSyncById = useMemo(
    () =>
      new Map(
        workspaceSyncStatus?.layouts.map((entry) => [entry.id, entry]) ?? [],
      ),
    [workspaceSyncStatus],
  )
  const draftSyncById = useMemo(
    () =>
      new Map(
        workspaceSyncStatus?.drafts.map((entry) => [entry.id, entry]) ?? [],
      ),
    [workspaceSyncStatus],
  )
  const activeLayoutSync =
    activeDraft
      ? draftSyncById.get(activeDraft.id) ?? null
      : activeLayout
        ? layoutSyncById.get(activeLayout.id) ?? null
        : null
  const layoutOptions = useMemo(
    () => [
      ...layouts.map((layout) => ({
        label: formatLayoutOptionLabel(layout.title, layoutSyncById.get(layout.id)),
        value: `layout:${layout.id}`,
      })),
      ...availableDraftLayouts.map((draft) => ({
        label: formatLayoutOptionLabel(
          `Draft: ${draft.layout?.title ?? draft.id}`,
          draftSyncById.get(draft.id),
        ),
        value: `draft:${draft.id}`,
      })),
    ],
    [availableDraftLayouts, draftSyncById, layoutSyncById, layouts],
  )
  const resolvedScene = useMemo(
    () =>
      resolveCanvasScene({
        activeLayout,
        baseScene,
        layouts,
      }),
    [activeLayout, baseScene, layouts],
  )
  const resolvedCompareOverlay = useMemo(
    () =>
      snapshot
        ? resolveLayoutCompareOverlay({
            snapshot,
            compareOverlay,
            draftLayouts,
            layouts,
            scene: resolvedScene,
          })
        : null,
    [compareOverlay, draftLayouts, layouts, resolvedScene, snapshot],
  )
  const overlayNodeIdSet = useMemo(
    () => new Set(resolvedCompareOverlay?.nodeIds ?? []),
    [resolvedCompareOverlay],
  )
  const compareOverlayActive =
    Boolean(resolvedCompareOverlay) &&
    overlayVisibility &&
    overlayFocusMode === 'highlight_dim'
  const currentCompareSource = useMemo(() => {
    if (activeDraft?.layout && canCompareLayoutAgainstSemantic(activeDraft.layout)) {
      return {
        sourceType: 'draft' as const,
        sourceId: activeDraft.id,
        title: activeDraft.layout.title,
      }
    }

    if (activeLayout && canCompareLayoutAgainstSemantic(activeLayout)) {
      return {
        sourceType: 'layout' as const,
        sourceId: activeLayout.id,
        title: activeLayout.title,
      }
    }

    return null
  }, [activeDraft, activeLayout])
  const editableDraftLayout = resolvedScene?.kind === 'layout' ? activeDraft : null
  const editableLayout = resolvedScene?.layoutSpec ?? activeLayout
  const activeLayoutSyncNote =
    activeLayoutSync?.state === 'outdated'
      ? {
          label: formatLayoutSyncLabel(activeLayoutSync),
          title: formatLayoutSyncTitle(activeLayoutSync),
        }
      : null

  useEffect(() => {
    if (!resolvedScene) {
      return
    }

    const layoutViewMode = getPreferredViewModeForLayout(resolvedScene.layoutSpec)

    if (viewMode !== layoutViewMode) {
      setViewMode(layoutViewMode)
    }
  }, [resolvedScene, setViewMode, viewMode])

  useEffect(() => {
    if (
      compareOverlay &&
      (baseScene.kind !== 'semantic_projection' || !resolvedCompareOverlay)
    ) {
      clearCompareOverlay()
    }
  }, [baseScene.kind, clearCompareOverlay, compareOverlay, resolvedCompareOverlay])

  function handleClearCompareOverlay() {
    clearCompareOverlay()
    setBaseScene({
      kind: 'active_layout',
    })
  }

  function handleActivateCompareOverlay() {
    if (!currentCompareSource) {
      return
    }

    setOverlayVisibility(true)
    setBaseScene({
      kind: 'semantic_projection',
    })
    setCompareOverlay({
      kind: 'layout_compare',
      sourceType: currentCompareSource.sourceType,
      sourceId: currentCompareSource.sourceId,
    })
    setInspectorOpen(true)
    setInspectorTabToFile()
  }

  function handleLayoutSelectionChange(value: string) {
    if (!value) {
      return
    }

    if (snapshot?.rootDir) {
      const workspaceRootDir = snapshot.rootDir
      setWorkspaceStateByRootDir((currentState) => ({
        ...currentState,
        [workspaceRootDir]: value.startsWith('draft:')
          ? {
              activeDraftId: value.slice('draft:'.length),
              activeLayoutId: undefined,
            }
          : {
              activeDraftId: undefined,
              activeLayoutId: value.slice('layout:'.length),
            },
      }))
      setWorkspaceViewResolvedRootDir(workspaceRootDir)
    }

    if (value.startsWith('draft:')) {
      const nextDraftId = value.slice('draft:'.length)
      const nextDraft =
        availableDraftLayouts.find((draft) => draft.id === nextDraftId) ?? null

      setBaseScene({
        kind: 'active_layout',
      })
      clearCompareOverlay()
      setActiveDraftId(nextDraftId)
      onClearDraftActionError()

      if (nextDraft?.layout) {
        setViewMode(getPreferredViewModeForLayout(nextDraft.layout))
      }

      return
    }

    const nextLayoutId = value.slice('layout:'.length)
    const nextLayout = layouts.find((layout) => layout.id === nextLayoutId) ?? null

    setBaseScene({
      kind: 'active_layout',
    })
    clearCompareOverlay()
    setActiveDraftId(null)
    setActiveLayoutId(nextLayoutId)
    onClearDraftActionError()

    if (nextLayout) {
      setViewMode(getPreferredViewModeForLayout(nextLayout))
    }
  }

  return {
    activeDraft,
    activeLayout,
    activeLayoutSyncNote,
    availableDraftLayouts,
    compareOverlayActive,
    currentCompareSource,
    editableDraftLayout,
    editableLayout,
    handleActivateCompareOverlay,
    handleClearCompareOverlay,
    handleLayoutSelectionChange,
    layoutOptions,
    overlayNodeIdSet,
    resolvedCompareOverlay,
    resolvedScene,
    selectedLayoutValue,
  }
}

function formatLayoutOptionLabel(
  baseLabel: string,
  syncEntry:
    | WorkspaceArtifactSyncStatus['layouts'][number]
    | undefined,
) {
  if (!syncEntry || syncEntry.state !== 'outdated') {
    return baseLabel
  }

  const issueCount = syncEntry.staleCount + syncEntry.missingCount
  return `${baseLabel} · outdated (${issueCount})`
}

function formatLayoutSyncLabel(
  syncEntry: WorkspaceArtifactSyncStatus['layouts'][number],
) {
  const parts = []

  if (syncEntry.staleCount > 0) {
    parts.push(`${syncEntry.staleCount} changed nodes`)
  }

  if (syncEntry.missingCount > 0) {
    parts.push(`${syncEntry.missingCount} missing nodes`)
  }

  return parts.length > 0
    ? `Layout parity diff · ${parts.join(' · ')}`
    : 'Layout parity diff'
}

function formatLayoutSyncTitle(
  syncEntry: WorkspaceArtifactSyncStatus['layouts'][number],
) {
  const parts = [formatLayoutSyncLabel(syncEntry)]

  if (syncEntry.affectedPaths.length > 0) {
    parts.push(`Changed files: ${syncEntry.affectedPaths.join(', ')}`)
  }

  if (syncEntry.missingNodeIds.length > 0) {
    parts.push(`Missing nodes: ${syncEntry.missingNodeIds.join(', ')}`)
  }

  return parts.join(' · ')
}

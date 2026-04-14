import type { LayoutSpec, SelectionState, ViewportState } from './layout'
import type { LayoutDraft } from './planner'
import type { AnalysisState } from './api'
import type { ProjectSnapshot } from './snapshot'

export type GraphLayerKey = 'filesystem' | 'imports' | 'calls'

export type GraphLayerVisibility = Record<GraphLayerKey, boolean>

export interface VisualizerStoreState {
  status: AnalysisState
  errorMessage: string | null
  snapshot: ProjectSnapshot | null
  layouts: LayoutSpec[]
  activeLayoutId: string | null
  draftLayouts: LayoutDraft[]
  activeDraftId: string | null
  viewport: ViewportState
  selection: SelectionState
  graphLayers: GraphLayerVisibility
}

export interface VisualizerStoreActions {
  setStatus: (status: AnalysisState) => void
  setErrorMessage: (message: string | null) => void
  setSnapshot: (snapshot: ProjectSnapshot | null) => void
  setLayouts: (layouts: LayoutSpec[]) => void
  setActiveLayoutId: (layoutId: string | null) => void
  setDraftLayouts: (draftLayouts: LayoutDraft[]) => void
  setActiveDraftId: (draftId: string | null) => void
  setViewport: (viewport: Partial<ViewportState>) => void
  setSelection: (selection: Partial<SelectionState>) => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  setInspectorTab: (tab: SelectionState['inspectorTab']) => void
  toggleGraphLayer: (layer: GraphLayerKey) => void
  setGraphLayerVisibility: (
    layers: Partial<GraphLayerVisibility>,
  ) => void
  reset: () => void
}

export type VisualizerStore = VisualizerStoreState & VisualizerStoreActions

export const DEFAULT_GRAPH_LAYER_VISIBILITY: GraphLayerVisibility = {
  filesystem: true,
  imports: false,
  calls: false,
}

export type LayoutStrategyKind = 'structural' | 'rule' | 'agent'
export type LayoutNodeScope = 'filesystem' | 'symbols' | 'mixed'
export type VisualizerViewMode = 'filesystem' | 'symbols'

export interface LayoutNodePlacement {
  nodeId: string
  x: number
  y: number
  width?: number
  height?: number
  parentId?: string | null
  laneId?: string
  hidden?: boolean
  zIndex?: number
}

export interface LayoutGroup {
  id: string
  title: string
  nodeIds: string[]
  collapsed?: boolean
}

export interface LayoutLane {
  id: string
  title: string
  order: number
  nodeIds: string[]
}

export interface LayoutAnnotation {
  id: string
  label: string
  x: number
  y: number
  width?: number
  height?: number
}

export interface LayoutSpec {
  id: string
  title: string
  strategy: LayoutStrategyKind
  nodeScope: LayoutNodeScope
  description?: string
  placements: Record<string, LayoutNodePlacement>
  groups: LayoutGroup[]
  lanes: LayoutLane[]
  annotations: LayoutAnnotation[]
  hiddenNodeIds: string[]
  createdAt?: string
  updatedAt?: string
}

export interface ViewportState {
  x: number
  y: number
  zoom: number
}

export type InspectorTab = 'file' | 'graph' | 'layout' | 'agent'

export interface SelectionState {
  nodeId: string | null
  nodeIds: string[]
  edgeId: string | null
  inspectorTab: InspectorTab
}

export const DEFAULT_VIEWPORT_STATE: ViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
}

export const DEFAULT_SELECTION_STATE: SelectionState = {
  nodeId: null,
  nodeIds: [],
  edgeId: null,
  inspectorTab: 'file',
}

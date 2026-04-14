import type { LayoutStrategyKind } from './layout'
import type { GraphEdge, ProjectSnapshot } from './snapshot'

export type AnalysisState = 'idle' | 'loading' | 'ready' | 'error'

export interface AnalysisStatus {
  state: AnalysisState
  updatedAt?: string
  message?: string
}

export interface SnapshotResponse {
  snapshot: ProjectSnapshot
}

export interface LayoutSummary {
  id: string
  title: string
  strategy: LayoutStrategyKind
  updatedAt?: string
}

export interface LayoutListResponse {
  layouts: LayoutSummary[]
  activeLayoutId: string | null
}

export interface GraphNeighborsResponse {
  nodeId: string
  incomingEdges: GraphEdge[]
  outgoingEdges: GraphEdge[]
  connectedNodeIds: string[]
}

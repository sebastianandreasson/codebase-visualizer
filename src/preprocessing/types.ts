import type { ProjectSnapshot } from '../schema/snapshot'
import type { SemanticPurposeSummaryRecord } from '../semantic/types'

export type PreprocessingRunState = 'idle' | 'building' | 'ready' | 'stale' | 'error'

export interface WorkspaceProfile {
  rootDir: string
  generatedAt: string
  totalFiles: number
  totalSymbols: number
  languages: string[]
  topDirectories: string[]
  entryFiles: string[]
  notableTags: string[]
  summary: string
}

export interface PreprocessedWorkspaceContext {
  snapshotId: string
  workspaceProfile: WorkspaceProfile
  purposeSummaries: SemanticPurposeSummaryRecord[]
}

export interface PreprocessingStatus {
  runState: PreprocessingRunState
  updatedAt: string | null
  purposeSummaryCount: number
  lastError: string | null
  snapshotId: string | null
}

export interface PreprocessingResult {
  context: PreprocessedWorkspaceContext
  snapshot: ProjectSnapshot
}

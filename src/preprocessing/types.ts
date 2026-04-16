import type { ProjectSnapshot } from '../schema/snapshot'
import type {
  SemanticEmbeddingVectorRecord,
  SemanticPurposeSummaryRecord,
} from '../semantic/types'

export type PreprocessingRunState = 'idle' | 'building' | 'ready' | 'stale' | 'error'

export interface PreprocessingProgress {
  processedSymbols: number
  recomputedSymbols: number
  reusedSymbols: number
  totalSymbols: number
}

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
  isComplete: boolean
  semanticEmbeddingModelId: string | null
  semanticEmbeddings: SemanticEmbeddingVectorRecord[]
  workspaceProfile: WorkspaceProfile
  purposeSummaries: SemanticPurposeSummaryRecord[]
}

export interface PreprocessingStatus {
  activity: 'embeddings' | 'summaries' | null
  runState: PreprocessingRunState
  updatedAt: string | null
  purposeSummaryCount: number
  semanticEmbeddingCount: number
  lastError: string | null
  processedSymbols: number
  snapshotId: string | null
  totalSymbols: number
}

export interface PreprocessingResult {
  context: PreprocessedWorkspaceContext
  snapshot: ProjectSnapshot
}

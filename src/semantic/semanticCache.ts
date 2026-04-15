import type {
  SemanticCacheManifest,
  SemanticCacheSnapshot,
  SemanticEmbeddingVectorRecord,
  SemanticPurposeSummaryRecord,
  SemanticProjectionRecord,
  SemanticSymbolTextRecord,
} from './types'

export const SEMANTIC_CACHE_VERSION = 1 as const

export function createSemanticCacheManifest(input: {
  workspaceRootDir: string
  modelId: string
  updatedAt?: string
}): SemanticCacheManifest {
  return {
    version: SEMANTIC_CACHE_VERSION,
    workspaceRootDir: input.workspaceRootDir,
    modelId: input.modelId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  }
}

export function createEmptySemanticCacheSnapshot(
  manifest: SemanticCacheManifest,
): SemanticCacheSnapshot {
  return {
    manifest,
    symbolTexts: [],
    purposeSummaries: [],
    embeddings: [],
    projection: null,
  }
}

export function mergeSemanticCacheSnapshot(
  snapshot: SemanticCacheSnapshot,
  input: {
    symbolTexts?: SemanticSymbolTextRecord[]
    purposeSummaries?: SemanticPurposeSummaryRecord[]
    embeddings?: SemanticEmbeddingVectorRecord[]
    projection?: SemanticProjectionRecord | null
  },
): SemanticCacheSnapshot {
  return {
    manifest: {
      ...snapshot.manifest,
      updatedAt: new Date().toISOString(),
    },
    symbolTexts: input.symbolTexts ?? snapshot.symbolTexts,
    purposeSummaries: input.purposeSummaries ?? snapshot.purposeSummaries,
    embeddings: input.embeddings ?? snapshot.embeddings,
    projection:
      input.projection === undefined ? snapshot.projection : input.projection,
  }
}

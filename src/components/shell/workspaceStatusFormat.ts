import type {
  PreprocessingStatus,
  WorkspaceArtifactSyncStatus,
} from '../../types'

export function formatPreprocessingStatusLabel(status: PreprocessingStatus) {
  switch (status.runState) {
    case 'building':
      return status.activity === 'embeddings'
        ? `Building embeddings… ${status.processedSymbols}/${status.totalSymbols || 0}`
        : `Building context… ${status.processedSymbols}/${status.totalSymbols || 0}`
    case 'stale':
      return status.activity === 'embeddings'
        ? `Refreshing embeddings… ${status.processedSymbols}/${status.totalSymbols || 0}`
        : `Refreshing context… ${status.processedSymbols}/${status.totalSymbols || 0}`
    case 'ready':
      return status.semanticEmbeddingCount > 0
        ? `Context ready · ${status.purposeSummaryCount} summaries · ${status.semanticEmbeddingCount} embeddings`
        : `Context ready · ${status.purposeSummaryCount} summaries`
    case 'error':
      return status.activity === 'embeddings' ? 'Embedding build failed' : 'Context build failed'
    default:
      return `Context not built · ${status.totalSymbols || 0} symbols`
  }
}

export function formatPreprocessingActionLabel(status: PreprocessingStatus) {
  switch (status.runState) {
    case 'ready':
    case 'stale':
      return 'Rebuild With Agent'
    case 'building':
      return 'Building With Agent…'
    case 'error':
      return 'Retry Build With Agent'
    default:
      return 'Build With Agent'
  }
}

export function formatEmbeddingActionLabel(status: PreprocessingStatus) {
  switch (status.runState) {
    case 'building':
      return status.activity === 'embeddings'
        ? 'Building Embeddings…'
        : 'Build Embeddings'
    case 'error':
      return status.activity === 'embeddings'
        ? 'Retry Embeddings'
        : status.semanticEmbeddingCount > 0
          ? 'Rebuild Embeddings'
          : 'Build Embeddings'
    default:
      return status.semanticEmbeddingCount > 0
        ? 'Rebuild Embeddings'
        : 'Build Embeddings'
  }
}

export function formatPreprocessingStatusTitle(status: PreprocessingStatus) {
  const parts = [formatPreprocessingStatusLabel(status)]

  if (status.currentItemPath) {
    parts.push(`Current: ${status.currentItemPath}`)
  }

  if (status.updatedAt) {
    parts.push(`Updated ${new Date(status.updatedAt).toLocaleTimeString()}`)
  }

  if (status.lastError) {
    parts.push(status.lastError)
  }

  return parts.join(' · ')
}

export function getPreprocessingProgressPercent(status: PreprocessingStatus) {
  if (status.totalSymbols <= 0) {
    return 0
  }

  return Math.max(
    0,
    Math.min(100, (status.processedSymbols / status.totalSymbols) * 100),
  )
}

export function hasWorkspaceSyncUpdates(status: WorkspaceArtifactSyncStatus) {
  return (
    status.summaries.state !== 'in_sync' ||
    status.embeddings.state !== 'in_sync' ||
    status.layouts.some((entry) => entry.state === 'outdated') ||
    status.drafts.some((entry) => entry.state === 'outdated')
  )
}

export function formatWorkspaceSyncTitle(status: WorkspaceArtifactSyncStatus) {
  if (!status.git.isGitRepo) {
    return 'The current workspace is not a git repository.'
  }

  const parts = [
    status.git.branch
      ? `Git ${status.git.branch} @ ${status.git.head?.slice(0, 7) ?? 'unknown'}`
      : `Git ${status.git.head?.slice(0, 7) ?? 'unknown'}`,
  ]

  if (status.git.changedFiles.length > 0) {
    parts.push(`Changed files: ${status.git.changedFiles.join(', ')}`)
  }

  if (status.summaries.affectedPaths.length > 0) {
    parts.push(`Summary diff: ${status.summaries.affectedPaths.join(', ')}`)
  }

  if (status.embeddings.affectedPaths.length > 0) {
    parts.push(`Embedding diff: ${status.embeddings.affectedPaths.join(', ')}`)
  }

  const outdatedLayouts = [...status.layouts, ...status.drafts].filter(
    (entry) => entry.state === 'outdated',
  )

  if (outdatedLayouts.length > 0) {
    parts.push(
      `Layouts needing parity updates: ${outdatedLayouts
        .map((entry) => `${entry.title} (${entry.affectedPaths.length || entry.missingCount})`)
        .join(', ')}`,
    )
  }

  return parts.join(' · ')
}

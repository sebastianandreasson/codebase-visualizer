import { buildSemanticPurposeSummaryRecord } from '../semantic/purposeSummaries'
import { buildSemanticSymbolTextRecord } from '../semantic/symbolText'
import { isSymbolNode, type ProjectSnapshot, type SymbolNode } from '../schema/snapshot'
import {
  getLatestPreprocessedWorkspaceContext,
  getPreprocessedWorkspaceContext,
  setPreprocessedWorkspaceContext,
} from './preprocessingCache'
import type { PreprocessedWorkspaceContext } from './types'
import { buildWorkspaceProfile } from './workspaceProfile'

export function preprocessWorkspaceSnapshot(
  snapshot: ProjectSnapshot,
): PreprocessedWorkspaceContext {
  const snapshotId = getPreprocessedSnapshotId(snapshot)
  const cachedContext = getPreprocessedWorkspaceContext(snapshotId)

  if (cachedContext) {
    return cachedContext
  }

  const previousContext = getLatestPreprocessedWorkspaceContext(snapshot.rootDir)
  const generatedAt = new Date().toISOString()
  const context: PreprocessedWorkspaceContext = {
    snapshotId,
    workspaceProfile: buildWorkspaceProfile(snapshot),
    purposeSummaries: buildIncrementalPurposeSummaries(snapshot, previousContext, generatedAt),
  }

  setPreprocessedWorkspaceContext(snapshotId, context)

  return context
}

export function hydratePreprocessedWorkspaceContext(
  context: PreprocessedWorkspaceContext,
) {
  setPreprocessedWorkspaceContext(context.snapshotId, context)
}

function buildIncrementalPurposeSummaries(
  snapshot: ProjectSnapshot,
  previousContext: PreprocessedWorkspaceContext | null,
  generatedAt: string,
) {
  const previousSummaryBySymbolId = new Map(
    previousContext?.purposeSummaries.map((summary) => [summary.symbolId, summary]) ?? [],
  )

  return Object.values(snapshot.nodes)
    .filter(isSymbolNode)
    .sort(compareSymbolsForPreprocessing)
    .map((symbol) => {
      const sourceTextRecord = buildSemanticSymbolTextRecord(snapshot, symbol, generatedAt)
      const previousSummary = previousSummaryBySymbolId.get(symbol.id)

      if (previousSummary && previousSummary.sourceHash === sourceTextRecord.textHash) {
        return previousSummary
      }

      return buildSemanticPurposeSummaryRecord(snapshot, symbol, generatedAt)
    })
}

export function getPreprocessedSnapshotId(snapshot: ProjectSnapshot) {
  return [
    snapshot.rootDir,
    snapshot.generatedAt,
    snapshot.totalFiles,
    snapshot.rootIds.length,
  ].join('::')
}

function compareSymbolsForPreprocessing(left: SymbolNode, right: SymbolNode) {
  const leftPath = `${left.path}:${left.range?.start.line ?? 0}:${left.range?.start.column ?? 0}`
  const rightPath = `${right.path}:${right.range?.start.line ?? 0}:${right.range?.start.column ?? 0}`
  return leftPath.localeCompare(rightPath)
}

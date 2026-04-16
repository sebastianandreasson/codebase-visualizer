import { buildSemanticPurposeSummaryRecord } from '../semantic/purposeSummaries'
import { buildSemanticSymbolTextRecord } from '../semantic/symbolText'
import {
  isFileNode,
  isSymbolNode,
  type ProjectSnapshot,
  type SymbolNode,
} from '../schema/snapshot'
import {
  getLatestPreprocessedWorkspaceContext,
  getPreprocessedWorkspaceContext,
  setPreprocessedWorkspaceContext,
} from './preprocessingCache'
import type {
  PreprocessedWorkspaceContext,
  PreprocessingProgress,
} from './types'
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
    isComplete: true,
    semanticEmbeddingModelId: null,
    semanticEmbeddings: [],
    workspaceProfile: buildWorkspaceProfile(snapshot),
    purposeSummaries: buildIncrementalPurposeSummaries(snapshot, previousContext, generatedAt),
  }

  setPreprocessedWorkspaceContext(snapshotId, context)

  return context
}

export async function preprocessWorkspaceSnapshotIncrementally(
  snapshot: ProjectSnapshot,
  options: {
    chunkSize?: number
    onProgress?: (progress: PreprocessingProgress) => void
    previousContext?: PreprocessedWorkspaceContext | null
  } = {},
) {
  const snapshotId = getPreprocessedSnapshotId(snapshot)
  const cachedContext = getPreprocessedWorkspaceContext(snapshotId)

  if (cachedContext) {
    options.onProgress?.({
      processedSymbols: cachedContext.purposeSummaries.length,
      recomputedSymbols: 0,
      reusedSymbols: cachedContext.purposeSummaries.length,
      totalSymbols: cachedContext.purposeSummaries.length,
    })
    return cachedContext
  }

  const previousContext =
    options.previousContext ?? getLatestPreprocessedWorkspaceContext(snapshot.rootDir)
  const generatedAt = new Date().toISOString()
  const symbols = getSymbolsForPreprocessing(snapshot)
  const previousSummaryBySymbolId = new Map(
    previousContext?.purposeSummaries.map((summary) => [summary.symbolId, summary]) ?? [],
  )
  const purposeSummaries = []
  const chunkSize = Math.max(1, options.chunkSize ?? 40)
  let recomputedSymbols = 0
  let reusedSymbols = 0

  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index]
    const sourceTextRecord = buildSemanticSymbolTextRecord(snapshot, symbol, generatedAt)
    const previousSummary = previousSummaryBySymbolId.get(symbol.id)

    if (previousSummary && previousSummary.sourceHash === sourceTextRecord.textHash) {
      purposeSummaries.push(previousSummary)
      reusedSymbols += 1
    } else {
      purposeSummaries.push(
        buildSemanticPurposeSummaryRecord(snapshot, symbol, generatedAt),
      )
      recomputedSymbols += 1
    }

    const processedSymbols = index + 1

    options.onProgress?.({
      processedSymbols,
      recomputedSymbols,
      reusedSymbols,
      totalSymbols: symbols.length,
    })

    if (processedSymbols < symbols.length && processedSymbols % chunkSize === 0) {
      await yieldToBrowser()
    }
  }

  const context: PreprocessedWorkspaceContext = {
    snapshotId,
    isComplete: true,
    semanticEmbeddingModelId: null,
    semanticEmbeddings: [],
    workspaceProfile: buildWorkspaceProfile(snapshot),
    purposeSummaries,
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

  return getSymbolsForPreprocessing(snapshot)
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

export function countPreprocessableSymbols(snapshot: ProjectSnapshot) {
  return getSymbolsForPreprocessing(snapshot).length
}

export function getPreprocessableSymbols(snapshot: ProjectSnapshot) {
  return getSymbolsForPreprocessing(snapshot)
}

function compareSymbolsForPreprocessing(left: SymbolNode, right: SymbolNode) {
  const leftPath = `${left.path}:${left.range?.start.line ?? 0}:${left.range?.start.column ?? 0}`
  const rightPath = `${right.path}:${right.range?.start.line ?? 0}:${right.range?.start.column ?? 0}`
  return leftPath.localeCompare(rightPath)
}

function getSymbolsForPreprocessing(snapshot: ProjectSnapshot) {
  return Object.values(snapshot.nodes)
    .filter(isSymbolNode)
    .filter((symbol) => shouldPreprocessSymbol(snapshot, symbol))
    .sort(compareSymbolsForPreprocessing)
}

function shouldPreprocessSymbol(
  snapshot: ProjectSnapshot,
  symbol: SymbolNode,
) {
  if (symbol.symbolKind === 'constant') {
    return false
  }

  if (
    (symbol.symbolKind === 'function' || symbol.symbolKind === 'method') &&
    isTinyImplementation(snapshot, symbol)
  ) {
    return false
  }

  return true
}

function isTinyImplementation(
  snapshot: ProjectSnapshot,
  symbol: SymbolNode,
) {
  if (!symbol.range) {
    return false
  }

  const lineSpan = Math.max(1, symbol.range.end.line - symbol.range.start.line + 1)

  if (lineSpan > 4) {
    return false
  }

  const fileNode = snapshot.nodes[symbol.fileId]

  if (!fileNode || !isFileNode(fileNode) || !fileNode.content) {
    return lineSpan <= 3
  }

  const lines = fileNode.content.split(/\r?\n/)
  const excerpt = lines
    .slice(symbol.range.start.line - 1, symbol.range.end.line)
    .join('\n')
    .trim()
  const normalizedExcerpt = excerpt.toLowerCase()

  if (
    normalizedExcerpt.includes('fetch(') ||
    normalizedExcerpt.includes('await ') ||
    normalizedExcerpt.includes('dispatch(') ||
    normalizedExcerpt.includes('navigate(') ||
    normalizedExcerpt.includes('localstorage') ||
    normalizedExcerpt.includes('sessionstorage') ||
    normalizedExcerpt.includes('pb.') ||
    normalizedExcerpt.includes('axios')
  ) {
    return false
  }

  return excerpt.length <= 180
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

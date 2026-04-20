import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  SEMANTIC_EMBEDDING_MODEL_ID,
  fetchWorkspaceSyncStatus,
  persistPreprocessedWorkspaceContext,
  requestLLMSemanticSummary,
  requestSemanticEmbeddings,
} from './apiClient'
import {
  countPreprocessableSymbols,
  getPreprocessableSymbols,
  getPreprocessedSnapshotId,
  hydratePreprocessedWorkspaceContext,
  preprocessWorkspaceSnapshotIncrementally,
} from '../preprocessing/preprocessingService'
import { buildWorkspaceProfile } from '../preprocessing/workspaceProfile'
import {
  buildSemanticPurposeSummaryPrompt,
  buildSemanticPurposeSummaryRecordFromModelOutput,
  parseSemanticPurposeSummaryResponse,
} from '../semantic/purposeSummaries'
import { buildSemanticSymbolTextRecord, hashSemanticText } from '../semantic/symbolText'
import type {
  CodebaseSnapshot,
  PreprocessedWorkspaceContext,
  PreprocessingStatus,
  WorkspaceArtifactSyncStatus,
} from '../types'

interface UsePreprocessingControllerInput {
  snapshot: CodebaseSnapshot | null
  getFallbackSnapshot: () => CodebaseSnapshot | null
  onWorkspaceSyncStatusChange: (status: WorkspaceArtifactSyncStatus) => void
}

type DerivedPreprocessingFields = Pick<
  PreprocessingStatus,
  'purposeSummaryCount' | 'semanticEmbeddingCount' | 'snapshotId' | 'updatedAt'
>
type PreprocessingRuntimeState =
  Omit<PreprocessingStatus, keyof DerivedPreprocessingFields> &
  Partial<DerivedPreprocessingFields>

const CLEARED_PREPROCESSING_FIELDS: DerivedPreprocessingFields = {
  purposeSummaryCount: 0,
  semanticEmbeddingCount: 0,
  snapshotId: null,
  updatedAt: null,
}
const EMPTY_PREPROCESSING_RUNTIME_STATE: PreprocessingRuntimeState = {
  activity: null,
  currentItemPath: null,
  lastError: null,
  processedSymbols: 0,
  runState: 'idle',
  totalSymbols: 0,
}

export function usePreprocessingController(
  input: UsePreprocessingControllerInput,
) {
  const [preprocessedWorkspaceContext, setPreprocessedWorkspaceContext] =
    useState<PreprocessedWorkspaceContext | null>(null)
  const [preprocessingRuntime, setPreprocessingRuntime] =
    useState<PreprocessingRuntimeState>(EMPTY_PREPROCESSING_RUNTIME_STATE)
  const preprocessingRunIdRef = useRef(0)
  const preprocessedWorkspaceContextRef = useRef<PreprocessedWorkspaceContext | null>(null)
  const preprocessingStatus = useMemo(
    () => derivePreprocessingStatus(preprocessingRuntime, preprocessedWorkspaceContext),
    [preprocessingRuntime, preprocessedWorkspaceContext],
  )

  useEffect(() => {
    preprocessedWorkspaceContextRef.current = preprocessedWorkspaceContext
  }, [preprocessedWorkspaceContext])

  function applyLoadedWorkspaceState(
    snapshot: CodebaseSnapshot,
    persistedContext: PreprocessedWorkspaceContext | null,
  ) {
    startTransition(() => {
      const totalSymbols = countPreprocessableSymbols(snapshot)
      const isPersistedContextFresh =
        persistedContext?.snapshotId === getPreprocessedSnapshotId(snapshot)
      const isPersistedContextReady =
        Boolean(
          persistedContext &&
            persistedContext.isComplete &&
            isPersistedContextFresh,
        )

      setPreprocessedWorkspaceContext(persistedContext)
      setPreprocessingRuntime(
        persistedContext
          ? {
              ...EMPTY_PREPROCESSING_RUNTIME_STATE,
              processedSymbols: persistedContext.purposeSummaries.length,
              runState: isPersistedContextReady ? 'ready' : 'stale',
              totalSymbols,
            }
          : {
              ...EMPTY_PREPROCESSING_RUNTIME_STATE,
              ...CLEARED_PREPROCESSING_FIELDS,
              totalSymbols,
            },
      )
    })
  }

  function resetForSnapshot(snapshot: CodebaseSnapshot) {
    startTransition(() => {
      setPreprocessingRuntime({
        ...EMPTY_PREPROCESSING_RUNTIME_STATE,
        ...CLEARED_PREPROCESSING_FIELDS,
        totalSymbols: countPreprocessableSymbols(snapshot),
      })
    })
  }

  function startBackgroundPreprocessing(
    nextSnapshot: CodebaseSnapshot,
    existingContext: PreprocessedWorkspaceContext | null,
    automatic: boolean,
  ) {
    if (!automatic && !existingContext) {
      setPreprocessingRuntime({
        ...EMPTY_PREPROCESSING_RUNTIME_STATE,
        ...CLEARED_PREPROCESSING_FIELDS,
        runState: 'building',
        activity: 'summaries',
        totalSymbols: countPreprocessableSymbols(nextSnapshot),
      })
    }

    const runId = preprocessingRunIdRef.current + 1
    preprocessingRunIdRef.current = runId

    startTransition(() => {
      setPreprocessingRuntime((current) => ({
        ...current,
        runState: existingContext ? 'stale' : 'building',
        activity: 'summaries',
        lastError: null,
        currentItemPath: null,
        processedSymbols: 0,
        totalSymbols: countPreprocessableSymbols(nextSnapshot),
      }))
    })

    window.setTimeout(() => {
      void Promise.resolve()
        .then(() =>
          preprocessWorkspaceSnapshotIncrementally(nextSnapshot, {
            onProgress: (progress) => {
              if (preprocessingRunIdRef.current !== runId) {
                return
              }

              setPreprocessingRuntime((current) => ({
                ...current,
                activity: 'summaries',
                currentItemPath: null,
                processedSymbols: progress.processedSymbols,
                purposeSummaryCount: progress.processedSymbols,
                totalSymbols: progress.totalSymbols,
              }))
            },
            previousContext: existingContext,
          }),
        )
        .then((context) => {
          if (preprocessingRunIdRef.current !== runId) {
            return
          }

          startTransition(() => {
            setPreprocessedWorkspaceContext(context)
            setPreprocessingRuntime({
              ...EMPTY_PREPROCESSING_RUNTIME_STATE,
              processedSymbols: context.purposeSummaries.length,
              runState: 'ready',
              totalSymbols: countPreprocessableSymbols(nextSnapshot),
            })
          })

          void persistPreprocessedWorkspaceContext(context).catch((error) => {
            if (preprocessingRunIdRef.current !== runId) {
              return
            }

            setPreprocessingRuntime((current) => ({
              ...current,
              lastError:
                error instanceof Error
                  ? error.message
                  : 'Failed to persist preprocessing cache.',
            }))
          })
        })
        .catch((error) => {
          if (preprocessingRunIdRef.current !== runId) {
            return
          }

          startTransition(() => {
            setPreprocessingRuntime((current) => ({
              ...current,
              lastError:
                error instanceof Error
                  ? error.message
                  : 'Failed to preprocess workspace context.',
              runState: 'error',
            }))
          })
        })
    }, 0)
  }

  function handleStartPreprocessing() {
    const nextSnapshot = input.snapshot ?? input.getFallbackSnapshot()

    if (!nextSnapshot) {
      startTransition(() => {
        setPreprocessingRuntime((current) => ({
          ...current,
          runState: 'error',
          activity: current.activity,
          lastError: 'The workspace snapshot is not ready yet.',
          currentItemPath: null,
        }))
      })
      return
    }

    setPreprocessingRuntime({
      ...EMPTY_PREPROCESSING_RUNTIME_STATE,
      runState: 'building',
      activity: 'summaries',
      totalSymbols: countPreprocessableSymbols(nextSnapshot),
    })

    void runLLMPreprocessing(nextSnapshot, preprocessedWorkspaceContextRef.current)
  }

  async function runLLMPreprocessing(
    nextSnapshot: CodebaseSnapshot,
    existingContext: PreprocessedWorkspaceContext | null,
  ) {
    const runId = preprocessingRunIdRef.current + 1
    preprocessingRunIdRef.current = runId
    const generatedAt = new Date().toISOString()
    const workspaceProfile = buildWorkspaceProfile(nextSnapshot)
    const symbols = getPreprocessableSymbols(nextSnapshot)
    const previousSummaryBySymbolId = new Map(
      existingContext?.purposeSummaries.map((summary) => [summary.symbolId, summary]) ?? [],
    )
    const nextPurposeSummaries = []
    let activeSymbolPath: string | null = null

    startTransition(() => {
      setPreprocessingRuntime({
        ...EMPTY_PREPROCESSING_RUNTIME_STATE,
        runState: 'building',
        activity: 'summaries',
        totalSymbols: countPreprocessableSymbols(nextSnapshot),
      })
    })

    try {
      for (const [index, symbol] of symbols.entries()) {
        if (preprocessingRunIdRef.current !== runId) {
          return
        }

        activeSymbolPath = symbol.path
        setPreprocessingRuntime((current) => ({
          ...current,
          activity: 'summaries',
          currentItemPath: symbol.path,
        }))
        const previousSummary = previousSummaryBySymbolId.get(symbol.id)
        const sourceTextRecord = buildSemanticSymbolTextRecord(
          nextSnapshot,
          symbol,
          generatedAt,
        )
        const record =
          previousSummary &&
          previousSummary.generator === 'llm' &&
          previousSummary.sourceHash === sourceTextRecord.textHash
            ? previousSummary
            : buildSemanticPurposeSummaryRecordFromModelOutput(
                nextSnapshot,
                symbol,
                parseSemanticPurposeSummaryResponse(
                  await requestLLMSemanticSummary(
                    buildSemanticPurposeSummaryPrompt(nextSnapshot, symbol),
                    {
                      kind: 'preprocessing_summary',
                      task: symbol.path,
                    },
                  ),
                ),
                generatedAt,
              )
        nextPurposeSummaries.push(record)
        const partialContext: PreprocessedWorkspaceContext = {
          snapshotId: getPreprocessedSnapshotId(nextSnapshot),
          isComplete: false,
          semanticEmbeddingModelId: existingContext?.semanticEmbeddingModelId ?? null,
          semanticEmbeddings: filterEmbeddingsForSummaries(existingContext, nextPurposeSummaries),
          workspaceProfile,
          purposeSummaries: nextPurposeSummaries.slice(),
        }

        hydratePreprocessedWorkspaceContext(partialContext)
        setPreprocessedWorkspaceContext(partialContext)
        await persistPreprocessedWorkspaceContext(partialContext)

        setPreprocessingRuntime((current) => ({
          ...current,
          activity: 'summaries',
          currentItemPath: symbol.path,
          processedSymbols: index + 1,
          purposeSummaryCount: index + 1,
        }))
      }

      const context: PreprocessedWorkspaceContext = {
        snapshotId: getPreprocessedSnapshotId(nextSnapshot),
        isComplete: true,
        semanticEmbeddingModelId: existingContext?.semanticEmbeddingModelId ?? null,
        semanticEmbeddings: filterEmbeddingsForSummaries(existingContext, nextPurposeSummaries),
        workspaceProfile,
        purposeSummaries: nextPurposeSummaries,
      }

      hydratePreprocessedWorkspaceContext(context)
      startTransition(() => {
        setPreprocessedWorkspaceContext(context)
        setPreprocessingRuntime({
          ...EMPTY_PREPROCESSING_RUNTIME_STATE,
          processedSymbols: context.purposeSummaries.length,
          runState: 'ready',
          totalSymbols: context.purposeSummaries.length,
        })
      })

      await persistPreprocessedWorkspaceContext(context)
      input.onWorkspaceSyncStatusChange(await fetchWorkspaceSyncStatus())
    } catch (error) {
      if (preprocessingRunIdRef.current !== runId) {
        return
      }

      startTransition(() => {
        setPreprocessingRuntime((current) => ({
          ...current,
          runState: 'error',
          activity: 'summaries',
          currentItemPath: activeSymbolPath,
          lastError:
            activeSymbolPath
              ? `Failed on ${activeSymbolPath}: ${error instanceof Error ? error.message : 'Unknown preprocessing error.'}`
              : error instanceof Error
                ? error.message
                : 'Failed to build LLM preprocessing context.',
        }))
      })
    }
  }

  async function handleBuildSemanticEmbeddings() {
    const nextSnapshot = input.snapshot ?? input.getFallbackSnapshot()
    const existingContext = preprocessedWorkspaceContextRef.current

    if (!nextSnapshot || !existingContext?.purposeSummaries.length) {
      setPreprocessingRuntime((current) => ({
        ...current,
        runState: 'error',
        activity: 'embeddings',
        lastError: 'Build summaries with the agent before generating embeddings.',
        currentItemPath: null,
      }))
      return
    }

    const totalSymbols = existingContext.purposeSummaries.length
    setPreprocessingRuntime({
      ...EMPTY_PREPROCESSING_RUNTIME_STATE,
      runState: 'building',
      activity: 'embeddings',
      totalSymbols,
    })

    const previousEmbeddingBySymbolId = new Map(
      existingContext.semanticEmbeddings.map((embedding) => [embedding.symbolId, embedding]),
    )
    const nextEmbeddings = []
    let activeSymbolPath: string | null = null

    try {
      for (const [index, summary] of existingContext.purposeSummaries.entries()) {
        activeSymbolPath = summary.path
        setPreprocessingRuntime((current) => ({
          ...current,
          activity: 'embeddings',
          currentItemPath: summary.path,
        }))
        const embeddingTextHash = hashSemanticText(summary.embeddingText)
        const previousEmbedding = previousEmbeddingBySymbolId.get(summary.symbolId)
        const embedding =
          previousEmbedding &&
          existingContext.semanticEmbeddingModelId === SEMANTIC_EMBEDDING_MODEL_ID &&
          previousEmbedding.textHash === embeddingTextHash
            ? previousEmbedding
            : (
                await requestSemanticEmbeddings([
                  {
                    id: summary.symbolId,
                    text: summary.embeddingText,
                    textHash: embeddingTextHash,
                  },
                ])
              )[0]

        nextEmbeddings.push(embedding)

        const partialContext: PreprocessedWorkspaceContext = {
          ...existingContext,
          semanticEmbeddingModelId: SEMANTIC_EMBEDDING_MODEL_ID,
          semanticEmbeddings: nextEmbeddings.slice(),
        }

        hydratePreprocessedWorkspaceContext(partialContext)
        setPreprocessedWorkspaceContext(partialContext)
        await persistPreprocessedWorkspaceContext(partialContext)

        setPreprocessingRuntime((current) => ({
          ...current,
          activity: 'embeddings',
          currentItemPath: summary.path,
          processedSymbols: index + 1,
          semanticEmbeddingCount: index + 1,
        }))
      }

      const context: PreprocessedWorkspaceContext = {
        ...existingContext,
        semanticEmbeddingModelId: SEMANTIC_EMBEDDING_MODEL_ID,
        semanticEmbeddings: nextEmbeddings,
      }

      hydratePreprocessedWorkspaceContext(context)
      setPreprocessedWorkspaceContext(context)
      setPreprocessingRuntime({
        ...EMPTY_PREPROCESSING_RUNTIME_STATE,
        runState: 'ready',
        processedSymbols: nextEmbeddings.length,
        totalSymbols,
      })
      await persistPreprocessedWorkspaceContext(context)
      input.onWorkspaceSyncStatusChange(await fetchWorkspaceSyncStatus())
    } catch (error) {
      setPreprocessingRuntime((current) => ({
        ...current,
        runState: 'error',
        activity: 'embeddings',
        currentItemPath: activeSymbolPath,
        lastError:
          activeSymbolPath
            ? `Embedding failed on ${activeSymbolPath}: ${error instanceof Error ? error.message : 'Unknown embedding error.'}`
            : error instanceof Error
              ? error.message
              : 'Failed to build semantic embeddings.',
      }))
    }
  }

  return {
    preprocessedWorkspaceContext,
    preprocessedWorkspaceContextRef,
    preprocessingStatus,
    applyLoadedWorkspaceState,
    resetForSnapshot,
    startBackgroundPreprocessing,
    handleStartPreprocessing,
    handleBuildSemanticEmbeddings,
  }
}

function derivePreprocessingStatus(
  runtime: PreprocessingRuntimeState,
  context: PreprocessedWorkspaceContext | null,
): PreprocessingStatus {
  const contextValues = getPreprocessingContextValues(context)

  return {
    activity: runtime.activity,
    currentItemPath: runtime.currentItemPath,
    lastError: runtime.lastError,
    processedSymbols: runtime.processedSymbols,
    purposeSummaryCount: runtime.purposeSummaryCount ?? contextValues.purposeSummaryCount,
    runState: runtime.runState,
    semanticEmbeddingCount: runtime.semanticEmbeddingCount ?? contextValues.semanticEmbeddingCount,
    snapshotId:
      runtime.snapshotId !== undefined
        ? runtime.snapshotId
        : contextValues.snapshotId,
    totalSymbols: runtime.totalSymbols,
    updatedAt:
      runtime.updatedAt !== undefined
        ? runtime.updatedAt
        : contextValues.updatedAt,
  }
}

function getPreprocessingContextValues(
  context: PreprocessedWorkspaceContext | null,
): DerivedPreprocessingFields {
  return {
    purposeSummaryCount: context?.purposeSummaries.length ?? 0,
    semanticEmbeddingCount: context?.semanticEmbeddings.length ?? 0,
    snapshotId: context?.snapshotId ?? null,
    updatedAt: context?.workspaceProfile.generatedAt ?? null,
  }
}

function filterEmbeddingsForSummaries(
  context: PreprocessedWorkspaceContext | null,
  summaries: PreprocessedWorkspaceContext['purposeSummaries'],
) {
  if (!context?.semanticEmbeddings.length || !context.semanticEmbeddingModelId) {
    return []
  }

  const embeddingsBySymbolId = new Map(
    context.semanticEmbeddings.map((embedding) => [embedding.symbolId, embedding]),
  )

  return summaries.flatMap((summary) => {
    const embedding = embeddingsBySymbolId.get(summary.symbolId)
    const embeddingTextHash = hashSemanticText(summary.embeddingText)

    return embedding && embedding.textHash === embeddingTextHash ? [embedding] : []
  })
}

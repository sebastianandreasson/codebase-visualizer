import { useMemo } from 'react'
import type { Edge } from '@xyflow/react'

import { getInspectorHeaderSummary } from '../components/inspector/inspectorUtils'
import {
  isFileNode,
  isSymbolNode,
  type CodebaseSnapshot,
  type TelemetryActivityEvent,
  type WorkingSetState,
} from '../types'
import {
  rankNearbySymbolsForGroupPrototype,
  type GroupPrototypeRecord,
} from '../semantic/groups/groupPrototypes'
import type { SemanticEmbeddingVectorRecord } from '../semantic/types'
import type { ResolvedCanvasScene } from '../visualizer/canvasScene'
import {
  buildGraphSummary,
  buildWorkingSetTitle,
  buildWorkspaceSidebarGroups,
  collectFiles,
  formatWorkingSetLabel,
  getLayoutGroupIdFromNodeId,
  getPrimaryFileFromNode,
  getPrimaryNode,
  getSelectedFile,
  getSelectedFiles,
  getSelectedSymbols,
  getWorkingSetPaths,
  isLayoutGroupNodeId,
} from '../visualizer/flowModel'

export interface UseSelectionViewModelInput {
  edges: Edge[]
  resolvedScene: ResolvedCanvasScene | null
  selectedEdgeId: string | null
  selectedNodeId: string | null
  selectedNodeIds: string[]
  semanticSearchEmbeddings: SemanticEmbeddingVectorRecord[]
  semanticSearchGroupPrototypes: GroupPrototypeRecord[]
  snapshot: CodebaseSnapshot | null | undefined
  telemetryActivityEvents: TelemetryActivityEvent[]
  workingSet: WorkingSetState
}

export function useSelectionViewModel({
  edges,
  resolvedScene,
  selectedEdgeId,
  selectedNodeId,
  selectedNodeIds,
  semanticSearchEmbeddings,
  semanticSearchGroupPrototypes,
  snapshot,
  telemetryActivityEvents,
  workingSet,
}: UseSelectionViewModelInput) {
  const snapshotOrNull = snapshot ?? null
  const files = useMemo(() => (snapshotOrNull ? collectFiles(snapshotOrNull) : []), [snapshotOrNull])
  const selectedNode =
    selectedNodeId && snapshotOrNull ? snapshotOrNull.nodes[selectedNodeId] ?? null : null
  const selectedLayoutGroup = useMemo(() => {
    if (!selectedNodeId || !isLayoutGroupNodeId(selectedNodeId) || !resolvedScene?.layoutSpec) {
      return null
    }

    const groupId = getLayoutGroupIdFromNodeId(selectedNodeId)
    return resolvedScene.layoutSpec.groups.find((group) => group.id === groupId) ?? null
  }, [resolvedScene, selectedNodeId])
  const selectedSymbol = selectedNode && isSymbolNode(selectedNode) ? selectedNode : null
  const selectedSymbols = getSelectedSymbols(snapshotOrNull, selectedNodeIds)
  const selectedFile = getSelectedFile(snapshotOrNull, selectedNode, files)
  const selectedFiles = getSelectedFiles(snapshotOrNull, selectedNodeIds)
  const selectedNodeTelemetry = useMemo<{
    confidence: 'exact' | 'attributed' | 'fallback'
    lastSeenAt: string | null
    requestCount: number
    source: 'interactive' | 'autonomous' | 'all'
    toolNames: string[]
    totalTokens: number
  } | null>(() => {
    const candidatePaths = new Set<string>()

    if (selectedFile) {
      candidatePaths.add(selectedFile.path)
    }

    if (selectedSymbol) {
      const ownerFile = snapshotOrNull?.nodes[selectedSymbol.fileId]

      if (ownerFile && isFileNode(ownerFile)) {
        candidatePaths.add(ownerFile.path)
      }
    }

    if (selectedLayoutGroup && snapshotOrNull) {
      for (const nodeId of selectedLayoutGroup.nodeIds) {
        const groupNode = snapshotOrNull.nodes[nodeId]

        if (groupNode && isSymbolNode(groupNode)) {
          const ownerFile = snapshotOrNull.nodes[groupNode.fileId]

          if (ownerFile && isFileNode(ownerFile)) {
            candidatePaths.add(ownerFile.path)
          }
          continue
        }

        if (groupNode && isFileNode(groupNode)) {
          candidatePaths.add(groupNode.path)
        }
      }
    }

    if (candidatePaths.size === 0) {
      return null
    }

    const matchedEvents = telemetryActivityEvents.filter((event) => candidatePaths.has(event.path))

    if (matchedEvents.length === 0) {
      return null
    }

    const toolNames = [...new Set(matchedEvents.flatMap((event) => event.toolNames))].slice(0, 8)

    const confidence: 'exact' | 'attributed' | 'fallback' = matchedEvents.some(
      (event) => event.confidence === 'exact',
    )
      ? 'exact'
      : matchedEvents.some((event) => event.confidence === 'attributed')
        ? 'attributed'
        : 'fallback'
    const source: 'interactive' | 'autonomous' | 'all' = matchedEvents.every(
      (event) => event.source === matchedEvents[0]?.source,
    )
      ? ((matchedEvents[0]?.source ?? 'all') as 'interactive' | 'autonomous' | 'all')
      : 'all'

    return {
      confidence,
      lastSeenAt: matchedEvents[0]?.timestamp ?? null,
      requestCount: matchedEvents.reduce((sum, event) => sum + event.requestCount, 0),
      source,
      toolNames,
      totalTokens: matchedEvents.reduce((sum, event) => sum + event.totalTokens, 0),
    }
  }, [
    selectedFile,
    selectedLayoutGroup,
    selectedSymbol,
    snapshotOrNull,
    telemetryActivityEvents,
  ])
  const selectedGroupPrototype = useMemo(() => {
    if (!selectedLayoutGroup) {
      return null
    }

    return (
      semanticSearchGroupPrototypes.find(
        (prototype) => prototype.groupId === selectedLayoutGroup.id,
      ) ?? null
    )
  }, [semanticSearchGroupPrototypes, selectedLayoutGroup])
  const selectedGroupNearbySymbols = useMemo(() => {
    if (!snapshotOrNull || !selectedGroupPrototype) {
      return []
    }

    return rankNearbySymbolsForGroupPrototype({
      prototype: selectedGroupPrototype,
      embeddings: semanticSearchEmbeddings,
      limit: 8,
    })
      .map((match) => {
        const node = snapshotOrNull.nodes[match.symbolId]

        if (!node || !isSymbolNode(node)) {
          return null
        }

        return {
          score: match.score,
          symbol: node,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  }, [semanticSearchEmbeddings, selectedGroupPrototype, snapshotOrNull])
  const workingSetNode = getPrimaryNode(snapshotOrNull, workingSet.nodeIds)
  const workingSetSymbols = getSelectedSymbols(snapshotOrNull, workingSet.nodeIds)
  const workingSetFiles = getSelectedFiles(snapshotOrNull, workingSet.nodeIds)
  const workingSetSymbol = workingSetSymbols[0] ?? null
  const workingSetFile =
    getPrimaryFileFromNode(snapshotOrNull, workingSetNode) ?? workingSetFiles[0] ?? null
  const workingSetContext = {
    file: workingSetFile,
    files: workingSetFiles,
    node: workingSetNode,
    symbol: workingSetSymbol,
    symbols: workingSetSymbols,
  }
  const selectedEdge =
    selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) ?? null : null
  const graphSummary = buildGraphSummary(selectedNodeId, edges, snapshotOrNull)
  const inspectorHeader = getInspectorHeaderSummary({
    selectedFile,
    selectedFiles,
    selectedLayoutGroup,
    selectedNode,
    selectedSymbols,
  })
  const workspaceSidebarGroups = useMemo(
    () =>
      buildWorkspaceSidebarGroups({
        layout: resolvedScene?.layoutSpec ?? null,
        snapshot: snapshotOrNull,
      }),
    [resolvedScene, snapshotOrNull],
  )
  const workingSetSummary =
    workingSet.nodeIds.length > 0
      ? {
          label: formatWorkingSetLabel(workingSetContext),
          title: buildWorkingSetTitle(workingSetContext, workingSet),
          paths: getWorkingSetPaths(workingSetContext),
        }
      : null

  return {
    files,
    graphSummary,
    inspectorHeader,
    selectedEdge,
    selectedFile,
    selectedFiles,
    selectedGroupNearbySymbols,
    selectedGroupPrototype,
    selectedLayoutGroup,
    selectedNode,
    selectedNodeTelemetry,
    selectedSymbol,
    selectedSymbols,
    workingSetContext,
    workingSetSummary,
    workspaceSidebarGroups,
  }
}

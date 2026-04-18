import type { Node } from '@xyflow/react'

import {
  isFileNode,
  isSymbolNode,
  type CodebaseFile,
  type ProjectSnapshot,
  type SymbolNode,
  type TelemetryActivityEvent,
  type TelemetryMode,
} from '../types'

export interface FollowTarget {
  eventKey: string
  fileNodeId: string
  nodeIds: string[]
  path: string
  toolNames: string[]
}

export function computePendingEditedPaths(input: {
  currentPendingPaths: string[]
  previousChangedPaths: ReadonlySet<string>
  liveChangedFiles: string[]
  telemetryActivityEvents: TelemetryActivityEvent[]
}) {
  const nextChangedPaths = new Set(input.liveChangedFiles)
  const newChangedPaths = input.liveChangedFiles.filter(
    (path) => !input.previousChangedPaths.has(path),
  )

  if (newChangedPaths.length === 0) {
    return input.currentPendingPaths.filter((path) => nextChangedPaths.has(path))
  }

  const telemetryIndexByPath = new Map<string, number>()

  input.telemetryActivityEvents.forEach((event, index) => {
    if (!telemetryIndexByPath.has(event.path)) {
      telemetryIndexByPath.set(event.path, index)
    }
  })

  newChangedPaths.sort((leftPath, rightPath) => {
    const leftIndex = telemetryIndexByPath.get(leftPath) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = telemetryIndexByPath.get(rightPath) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })

  const existingPending = input.currentPendingPaths.filter((path) =>
    nextChangedPaths.has(path),
  )
  const nextPending = [...existingPending]

  for (const path of newChangedPaths) {
    if (!nextPending.includes(path)) {
      nextPending.push(path)
    }
  }

  return nextPending
}

export function getLatestAgentActivityTarget(input: {
  changedPaths?: string[]
  snapshot: ProjectSnapshot | null
  telemetryActivityEvents: TelemetryActivityEvent[]
  telemetryEnabled: boolean
  telemetryMode: TelemetryMode
  visibleNodes: Node[]
}) {
  if (
    !input.telemetryEnabled ||
    !input.snapshot ||
    input.telemetryActivityEvents.length === 0
  ) {
    return null
  }

  const visibleNodeIds = new Set(input.visibleNodes.map((node) => node.id))
  const changedPathSet =
    input.changedPaths && input.changedPaths.length > 0
      ? new Set(input.changedPaths)
      : null
  const fileIdsByPath = new Map<string, string>()
  const symbolIdsByFileId = new Map<string, string[]>()

  for (const node of Object.values(input.snapshot.nodes)) {
    if (isFileNode(node)) {
      fileIdsByPath.set(node.path, node.id)
      continue
    }

    if (isSymbolNode(node)) {
      const currentSymbolIds = symbolIdsByFileId.get(node.fileId) ?? []
      currentSymbolIds.push(node.id)
      symbolIdsByFileId.set(node.fileId, currentSymbolIds)
    }
  }

  for (const event of input.telemetryActivityEvents) {
    if (changedPathSet && !changedPathSet.has(event.path)) {
      continue
    }

    const fileNodeId = fileIdsByPath.get(event.path)

    if (!fileNodeId) {
      continue
    }

    const targetNodeIds =
      input.telemetryMode === 'symbols'
        ? getPreferredFollowSymbolIdsForFile({
            fileId: fileNodeId,
            snapshot: input.snapshot,
            symbolIdsByFileId,
          }).filter((nodeId) => visibleNodeIds.has(nodeId))
        : visibleNodeIds.has(fileNodeId)
          ? [fileNodeId]
          : []
    const fallbackNodeIds =
      targetNodeIds.length === 0 && visibleNodeIds.has(fileNodeId)
        ? [fileNodeId]
        : targetNodeIds

    if (
      fallbackNodeIds.length === 0 &&
      !(changedPathSet?.has(event.path) || isEditTelemetryEvent(event.toolNames))
    ) {
      continue
    }

    return {
      eventKey: event.key,
      fileNodeId,
      nodeIds: fallbackNodeIds,
      path: event.path,
      toolNames: event.toolNames,
    } satisfies FollowTarget
  }

  return null
}

export function getLatestEditedActivityTarget(input: {
  changedPaths?: string[]
  snapshot: ProjectSnapshot | null
  telemetryActivityEvents: TelemetryActivityEvent[]
  telemetryEnabled: boolean
  telemetryMode: TelemetryMode
  visibleNodes: Node[]
}) {
  if (
    !input.telemetryEnabled ||
    !input.snapshot ||
    input.telemetryActivityEvents.length === 0
  ) {
    return null
  }

  const visibleNodeIds = new Set(input.visibleNodes.map((node) => node.id))
  const changedPathSet =
    input.changedPaths && input.changedPaths.length > 0
      ? new Set(input.changedPaths)
      : null
  const fileIdsByPath = new Map<string, string>()
  const symbolIdsByFileId = new Map<string, string[]>()

  for (const node of Object.values(input.snapshot.nodes)) {
    if (isFileNode(node)) {
      fileIdsByPath.set(node.path, node.id)
      continue
    }

    if (isSymbolNode(node)) {
      const currentSymbolIds = symbolIdsByFileId.get(node.fileId) ?? []
      currentSymbolIds.push(node.id)
      symbolIdsByFileId.set(node.fileId, currentSymbolIds)
    }
  }

  for (const event of input.telemetryActivityEvents) {
    if (!isEditTelemetryEvent(event.toolNames)) {
      continue
    }

    if (changedPathSet && !changedPathSet.has(event.path)) {
      continue
    }

    const fileNodeId = fileIdsByPath.get(event.path)

    if (!fileNodeId) {
      continue
    }

    const targetNodeIds =
      input.telemetryMode === 'symbols'
        ? getPreferredFollowSymbolIdsForFile({
            fileId: fileNodeId,
            snapshot: input.snapshot,
            symbolIdsByFileId,
          }).filter((nodeId) => visibleNodeIds.has(nodeId))
        : visibleNodeIds.has(fileNodeId)
          ? [fileNodeId]
          : []
    const fallbackNodeIds =
      targetNodeIds.length === 0 && visibleNodeIds.has(fileNodeId)
        ? [fileNodeId]
        : targetNodeIds

    if (fallbackNodeIds.length === 0) {
      continue
    }

    return {
      eventKey: event.key,
      fileNodeId,
      nodeIds: fallbackNodeIds,
      path: event.path,
      toolNames: event.toolNames,
    } satisfies FollowTarget
  }

  return null
}

export function buildPendingEditedTargetFromPath(input: {
  path: string
  snapshot: ProjectSnapshot
  telemetryMode: TelemetryMode
  visibleNodes: Node[]
}) {
  const visibleNodeIds = new Set(input.visibleNodes.map((node) => node.id))
  const fileNode = Object.values(input.snapshot.nodes).find(
    (node): node is CodebaseFile => isFileNode(node) && node.path === input.path,
  )

  if (!fileNode) {
    return null
  }

  const symbolIdsByFileId = new Map<string, string[]>()

  for (const node of Object.values(input.snapshot.nodes)) {
    if (!isSymbolNode(node)) {
      continue
    }

    const currentSymbolIds = symbolIdsByFileId.get(node.fileId) ?? []
    currentSymbolIds.push(node.id)
    symbolIdsByFileId.set(node.fileId, currentSymbolIds)
  }

  const symbolNodeIds =
    input.telemetryMode === 'symbols'
      ? getPreferredFollowSymbolIdsForFile({
          fileId: fileNode.id,
          snapshot: input.snapshot,
          symbolIdsByFileId,
        }).filter((nodeId) => visibleNodeIds.has(nodeId))
      : []
  const nodeIds =
    input.telemetryMode === 'symbols'
      ? symbolNodeIds.length > 0
        ? symbolNodeIds
        : visibleNodeIds.has(fileNode.id)
          ? [fileNode.id]
          : []
      : visibleNodeIds.has(fileNode.id)
        ? [fileNode.id]
        : [fileNode.id]

  return {
    eventKey: `git:${input.path}`,
    fileNodeId: fileNode.id,
    nodeIds,
    path: input.path,
    toolNames: ['git-diff'],
  } satisfies FollowTarget
}

export function getPreferredFollowSymbolIdsForFile(input: {
  fileId: string
  snapshot: ProjectSnapshot
  symbolIdsByFileId: Map<string, string[]>
}) {
  const symbolIds = input.symbolIdsByFileId.get(input.fileId) ?? []
  const symbols = symbolIds
    .map((symbolId) => input.snapshot.nodes[symbolId])
    .filter(isSymbolNode)

  if (symbols.length === 0) {
    return []
  }

  const preferredSymbols = symbols.filter(isPreferredFollowSymbolNode)
  const candidates = preferredSymbols.length > 0 ? preferredSymbols : symbols

  return [...candidates]
    .sort(compareSymbolsForFollow)
    .map((symbol) => symbol.id)
}

export function isEditTelemetryEvent(toolNames: string[]) {
  return toolNames.some((toolName) => {
    const normalizedToolName = toolName.trim().toLowerCase()

    return (
      normalizedToolName.includes('apply') ||
      normalizedToolName.includes('write') ||
      normalizedToolName.includes('edit') ||
      normalizedToolName.includes('patch') ||
      normalizedToolName.includes('replace')
    )
  })
}

function isPreferredFollowSymbolNode(symbol: SymbolNode) {
  const normalizedName = symbol.name.trim().toLowerCase()

  if (
    normalizedName.length === 0 ||
    normalizedName === 'anon' ||
    normalizedName === 'anonymous' ||
    normalizedName === 'global'
  ) {
    return false
  }

  return symbol.symbolKind !== 'unknown' && symbol.symbolKind !== 'module'
}

function compareSymbolsForFollow(left: SymbolNode, right: SymbolNode) {
  const leftPreferred = isPreferredFollowSymbolNode(left) ? 0 : 1
  const rightPreferred = isPreferredFollowSymbolNode(right) ? 0 : 1

  if (leftPreferred !== rightPreferred) {
    return leftPreferred - rightPreferred
  }

  const leftKindRank = getFollowSymbolKindRank(left)
  const rightKindRank = getFollowSymbolKindRank(right)

  if (leftKindRank !== rightKindRank) {
    return leftKindRank - rightKindRank
  }

  const leftLine = left.range?.start.line ?? Number.MAX_SAFE_INTEGER
  const rightLine = right.range?.start.line ?? Number.MAX_SAFE_INTEGER

  if (leftLine !== rightLine) {
    return leftLine - rightLine
  }

  return left.id.localeCompare(right.id)
}

function getFollowSymbolKindRank(symbol: SymbolNode) {
  switch (symbol.symbolKind) {
    case 'class':
      return 0
    case 'function':
      return 1
    case 'method':
      return 2
    case 'constant':
      return 3
    case 'variable':
      return 4
    default:
      return 99
  }
}

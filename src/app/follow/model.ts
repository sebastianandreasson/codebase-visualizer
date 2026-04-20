import type { VisualizerViewMode } from '../../schema/layout'
import type { AgentFileOperationRange } from '../../schema/agent'
import { isSymbolNode, type ProjectSnapshot } from '../../schema/snapshot'
import type { TelemetryActivityEvent, TelemetryMode } from '../../schema/telemetry'
import {
  appendAcknowledgedCommandId,
  buildCameraCommand,
  buildFollowDebugState,
  buildInspectorCommand,
  buildRefreshCommand,
  countQueuedCameraTargets,
  createCameraCommandId,
  FOLLOW_AGENT_EDIT_CAMERA_LOCK_MS,
} from './commands'
import {
  compareFollowEventsDescending,
  compareFollowEventsForPlayback,
  createDirtyFileFollowEvent,
  createDirtySignalFollowEvent,
  createFileOperationFollowEvent,
  createLifecycleFollowEvent,
  createTelemetryFollowEvent,
  shouldUseTelemetryEventForFollow,
} from './events'
import {
  buildFollowIndexes,
  getPreferredFollowSymbolIdsForFile,
} from './snapshot'
import type {
  FollowControllerAction,
  FollowControllerContext,
  FollowControllerState,
  FollowControllerView,
  FollowFileEvent,
  FollowIndexes,
  FollowIntent,
  FollowTargetConfidence,
  ResolvedFollowTarget,
} from './types'

export function createInitialFollowControllerState(): FollowControllerState {
  const nowMs = Date.now()

  return {
    cameraLockUntilMs: 0,
    acknowledgedCommandIds: [],
    latestEvent: null,
    nowMs,
    pendingDirtyPaths: [],
    refreshStatus: 'idle',
  }
}

export function followControllerReducer(
  state: FollowControllerState,
  action: FollowControllerAction,
): FollowControllerState {
  switch (action.type) {
    case 'FOLLOW_TOGGLED':
      return {
        ...createInitialFollowControllerState(),
        latestEvent: createLifecycleFollowEvent(
          action.enabled ? 'follow_enabled' : 'follow_disabled',
          action.nowMs,
        ),
        nowMs: action.nowMs,
      }
    case 'DIRTY_PATHS_RECONCILED':
      return {
        ...state,
        nowMs: action.nowMs,
        pendingDirtyPaths: computePendingEditedPaths({
          currentPendingPaths: state.pendingDirtyPaths,
          liveChangedFiles: action.liveChangedFiles,
          previousChangedPaths: new Set(action.previousChangedPaths),
          reprioritizedPaths: action.reprioritizedPaths,
          telemetryActivityEvents: action.telemetryActivityEvents,
        }),
      }
    case 'FOLLOW_EVENT_RECORDED':
      return {
        ...state,
        latestEvent: action.event,
        nowMs: action.nowMs,
      }
    case 'COMMAND_ACKNOWLEDGED': {
      const nextState: FollowControllerState = {
        ...state,
        acknowledgedCommandIds: appendAcknowledgedCommandId(
          state.acknowledgedCommandIds,
          action.commandId,
        ),
        nowMs: action.nowMs,
      }

      if (action.commandType === 'camera') {
        if (action.intent === 'edit') {
          nextState.cameraLockUntilMs = action.nowMs + FOLLOW_AGENT_EDIT_CAMERA_LOCK_MS
        }
      }

      if (action.commandType === 'inspector') {
        if (action.pendingPath) {
          nextState.pendingDirtyPaths = nextState.pendingDirtyPaths.filter(
            (path) => path !== action.pendingPath,
          )
        }
      }

      if (action.commandType === 'refresh') {
        nextState.refreshStatus = 'pending'
      }

      return nextState
    }
    case 'REFRESH_STATUS_CHANGED':
      return {
        ...state,
        nowMs: action.nowMs,
        refreshStatus: action.status,
      }
    case 'CLOCK_TICKED':
      return {
        ...state,
        nowMs: action.nowMs,
      }
  }
}

export function computePendingEditedPaths(input: {
  currentPendingPaths: string[]
  previousChangedPaths: ReadonlySet<string>
  liveChangedFiles: string[]
  reprioritizedPaths: string[]
  telemetryActivityEvents: TelemetryActivityEvent[]
}) {
  const nextChangedPaths = new Set(input.liveChangedFiles)
  const newChangedPaths = input.liveChangedFiles.filter(
    (path) => !input.previousChangedPaths.has(path),
  )
  const prioritizedPaths = [...new Set(
    input.reprioritizedPaths.filter((path) => nextChangedPaths.has(path)),
  )]

  if (newChangedPaths.length === 0 && prioritizedPaths.length === 0) {
    return input.currentPendingPaths.filter((path) => nextChangedPaths.has(path))
  }

  const telemetryIndexByPath = new Map<string, number>()

  input.telemetryActivityEvents
    .filter(shouldUseTelemetryEventForFollow)
    .forEach((event, index) => {
      if (!telemetryIndexByPath.has(event.path)) {
        telemetryIndexByPath.set(event.path, index)
      }
    })

  newChangedPaths.sort((leftPath, rightPath) => {
    const leftIndex = telemetryIndexByPath.get(leftPath) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = telemetryIndexByPath.get(rightPath) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })

  const candidatePaths = [...prioritizedPaths]

  for (const path of newChangedPaths) {
    if (!candidatePaths.includes(path)) {
      candidatePaths.push(path)
    }
  }

  const existingPending = input.currentPendingPaths.filter(
    (path) => nextChangedPaths.has(path) && !candidatePaths.includes(path),
  )
  const nextPending = [...candidatePaths]

  for (const path of existingPending) {
    if (!nextPending.includes(path)) {
      nextPending.push(path)
    }
  }

  return nextPending
}

export function deriveFollowControllerView(
  state: FollowControllerState,
  context: FollowControllerContext,
): FollowControllerView {
  if (!context.enabled) {
    return {
      cameraCommand: null,
      debug: buildFollowDebugState({
        cameraLockUntilMs: 0,
        currentMode: 'idle',
        currentTarget: null,
        latestEvent: state.latestEvent,
        queueLength: 0,
        refreshInFlight: false,
        refreshPending: false,
        nowMs: state.nowMs,
      }),
      inspectorCommand: null,
      latestResolvedActivityTarget: null,
      latestResolvedEditTarget: null,
      refreshCommand: null,
    }
  }

  const indexes = buildFollowIndexes(context.snapshot)
  const normalizedTelemetryEvents = context.telemetryEnabled
    ? context.telemetryActivityEvents
        .filter(shouldUseTelemetryEventForFollow)
        .map((event) => createTelemetryFollowEvent(event, state.nowMs))
        .sort(compareFollowEventsDescending)
    : []
  const normalizedFileOperationEvents = context.fileOperations
    .map((operation) => createFileOperationFollowEvent(operation, state.nowMs))
    .filter((event): event is FollowFileEvent => Boolean(event))
    .sort(compareFollowEventsDescending)
  const normalizedDirtyEditEvents = context.dirtyFileEditSignals
    .map(createDirtySignalFollowEvent)
    .sort(compareFollowEventsDescending)
  const normalizedActivityEvents = [
    ...normalizedFileOperationEvents,
    ...normalizedTelemetryEvents,
  ].filter((event) => event.type === 'file_touched')
    .sort(compareFollowEventsDescending)
  const normalizedEditEvents = [
    ...normalizedDirtyEditEvents,
    ...normalizedFileOperationEvents,
    ...normalizedTelemetryEvents,
  ]
    .filter((event) => event.type === 'file_edited')
    .sort(compareFollowEventsDescending)
  const latestResolvedEdit = resolveLatestEditTarget({
    indexes,
    liveChangedFiles: context.liveChangedFiles,
    mode: getFollowTargetMode(context.viewMode),
    normalizedEditEvents,
    pendingDirtyPaths: state.pendingDirtyPaths,
    snapshot: context.snapshot,
    viewMode: context.viewMode,
    visibleNodeIds: context.visibleNodeIds,
  })
  const resolvedActivityQueue = resolveActivityTargets({
    indexes,
    mode: getFollowTargetMode(context.viewMode),
    normalizedActivityEvents: [...normalizedActivityEvents].sort(compareFollowEventsForPlayback),
    snapshot: context.snapshot,
    viewMode: context.viewMode,
    visibleNodeIds: context.visibleNodeIds,
  })
  const latestResolvedActivity = resolvedActivityQueue[0] ?? null
  const candidateTargets = [
    ...(latestResolvedEdit ? [latestResolvedEdit.target] : []),
    ...resolvedActivityQueue.map((resolvedTarget) => resolvedTarget.target),
  ]
  const latestEvent =
    latestResolvedEdit?.sourceEvent ??
    latestResolvedActivity?.sourceEvent ??
    state.latestEvent
  const currentCameraCommand = buildCameraCommand({
    acknowledgedCommandIds: state.acknowledgedCommandIds,
    cameraLockUntilMs: state.cameraLockUntilMs,
    editTargets: latestResolvedEdit ? [latestResolvedEdit.target] : [],
    nowMs: state.nowMs,
    activityTargets: resolvedActivityQueue.map((resolvedTarget) => resolvedTarget.target),
  })
  const currentTarget = currentCameraCommand?.target ??
    latestResolvedEdit?.target ??
    latestResolvedActivity?.target ??
    null
  const currentMode: FollowIntent | 'idle' = currentTarget?.intent ?? 'idle'
  const currentInspectorCommand = buildInspectorCommand({
    acknowledgedCommandIds: state.acknowledgedCommandIds,
    pendingPath:
      currentTarget?.intent === 'edit' &&
      currentTarget.eventKey === latestResolvedEdit?.target.eventKey
        ? latestResolvedEdit.pendingPath
        : null,
    target: currentTarget,
  })
  const currentRefreshCommand = buildRefreshCommand({
    acknowledgedCommandIds: state.acknowledgedCommandIds,
    editTarget: latestResolvedEdit?.target ?? null,
    refreshStatus: state.refreshStatus,
    viewMode: context.viewMode,
  })
  const refreshInFlight = state.refreshStatus === 'in_flight'
  const refreshPending = state.refreshStatus !== 'idle'

  return {
    cameraCommand: currentCameraCommand,
    debug: buildFollowDebugState({
      cameraLockUntilMs: state.cameraLockUntilMs,
      currentMode,
      currentTarget,
      latestEvent,
      queueLength: state.pendingDirtyPaths.length +
        countQueuedCameraTargets({
          acknowledgedCommandIds: state.acknowledgedCommandIds,
          currentCommand: currentCameraCommand,
          targets: candidateTargets,
        }),
      refreshInFlight,
      refreshPending,
      nowMs: state.nowMs,
    }),
    inspectorCommand: currentInspectorCommand,
    latestResolvedActivityTarget: latestResolvedActivity?.target ?? null,
    latestResolvedEditTarget: latestResolvedEdit?.target ?? null,
    refreshCommand: currentRefreshCommand,
  }
}

function resolveActivityTargets(input: {
  indexes: FollowIndexes | null
  mode: TelemetryMode
  normalizedActivityEvents: FollowFileEvent[]
  snapshot: ProjectSnapshot | null
  viewMode: VisualizerViewMode
  visibleNodeIds: string[]
}) {
  const result: ResolvedFollowTarget[] = []
  const seenCommandIds = new Set<string>()

  for (const event of input.normalizedActivityEvents) {
    const resolvedTarget = resolveFollowTargetFromEvent({
      allowInvisibleFileFallback: input.viewMode === 'filesystem',
      indexes: input.indexes,
      intent: 'activity',
      mode: input.mode,
      snapshot: input.snapshot,
      sourceEvent: event,
      viewMode: input.viewMode,
      visibleNodeIds: input.visibleNodeIds,
    })

    if (resolvedTarget) {
      const commandId = createCameraCommandId(resolvedTarget.target)

      if (!seenCommandIds.has(commandId)) {
        seenCommandIds.add(commandId)
        result.push(resolvedTarget)
      }
    }
  }

  return result
}

function resolveLatestEditTarget(input: {
  indexes: FollowIndexes | null
  liveChangedFiles: string[]
  mode: TelemetryMode
  normalizedEditEvents: FollowFileEvent[]
  pendingDirtyPaths: string[]
  snapshot: ProjectSnapshot | null
  viewMode: VisualizerViewMode
  visibleNodeIds: string[]
}) {
  const latestEditTelemetryEvents = input.normalizedEditEvents
  const dirtyPathSet = new Set(input.liveChangedFiles)
  const nextPendingPath = input.pendingDirtyPaths[0] ?? null

  if (nextPendingPath) {
    const pendingTelemetryEvent =
      latestEditTelemetryEvents.find((event) => event.path === nextPendingPath) ??
      createDirtyFileFollowEvent(nextPendingPath)
    const pendingTarget = resolveFollowTargetFromEvent({
      allowInvisibleFileFallback: true,
      indexes: input.indexes,
      intent: 'edit',
      mode: input.mode,
      snapshot: input.snapshot,
      sourceEvent: pendingTelemetryEvent,
      viewMode: input.viewMode,
      visibleNodeIds: input.visibleNodeIds,
    })

    if (pendingTarget) {
      return {
        ...pendingTarget,
        pendingPath: nextPendingPath,
      }
    }
  }

  for (const event of latestEditTelemetryEvents) {
    if (dirtyPathSet.size > 0 && !dirtyPathSet.has(event.path)) {
      continue
    }

    const resolvedTarget = resolveFollowTargetFromEvent({
      allowInvisibleFileFallback: true,
      indexes: input.indexes,
      intent: 'edit',
      mode: input.mode,
      snapshot: input.snapshot,
      sourceEvent: event,
      viewMode: input.viewMode,
      visibleNodeIds: input.visibleNodeIds,
    })

    if (resolvedTarget) {
      return resolvedTarget
    }
  }

  if (dirtyPathSet.size === 0) {
    return null
  }

  for (const pathValue of dirtyPathSet) {
    const dirtyFallbackTarget = resolveFollowTargetFromEvent({
      allowInvisibleFileFallback: true,
      indexes: input.indexes,
      intent: 'edit',
      mode: input.mode,
      snapshot: input.snapshot,
      sourceEvent: createDirtyFileFollowEvent(pathValue),
      viewMode: input.viewMode,
      visibleNodeIds: input.visibleNodeIds,
    })

    if (dirtyFallbackTarget) {
      return dirtyFallbackTarget
    }
  }

  return null
}

function resolveFollowTargetFromEvent(input: {
  allowInvisibleFileFallback: boolean
  indexes: FollowIndexes | null
  intent: FollowIntent
  mode: TelemetryMode
  snapshot: ProjectSnapshot | null
  sourceEvent: FollowFileEvent
  viewMode: VisualizerViewMode
  visibleNodeIds: string[]
}): ResolvedFollowTarget | null {
  if (!input.snapshot || !input.indexes) {
    return null
  }

  const visibleNodeIdSet = new Set(input.visibleNodeIds)
  const fileNodeId = input.indexes.fileIdsByPath.get(input.sourceEvent.path)

  if (!fileNodeId) {
    return null
  }

  const explicitSymbolIds = getValidExplicitSymbolIds({
    fileNodeId,
    snapshot: input.snapshot,
    symbolNodeIds: input.sourceEvent.symbolNodeIds ?? [],
  })

  if (explicitSymbolIds.length > 0 && input.mode === 'symbols') {
    return {
      pendingPath: null,
      sourceEvent: input.sourceEvent,
      target: {
        confidence: 'exact_symbol',
        eventKey: input.sourceEvent.eventKey,
        fileNodeId,
        intent: input.intent,
        kind: 'symbol',
        operationRanges: input.sourceEvent.operationRanges,
        path: input.sourceEvent.path,
        primaryNodeId: explicitSymbolIds[0],
        requiresSnapshotRefresh: input.intent === 'edit' && input.viewMode === 'symbols',
        shouldOpenInspector: true,
        symbolNodeIds: explicitSymbolIds,
        timestamp: input.sourceEvent.timestamp,
        toolNames: input.sourceEvent.toolNames,
      },
    }
  }

  const visibleSymbolIds =
    input.mode === 'symbols'
      ? getPreferredFollowSymbolIdsForFile({
          fileId: fileNodeId,
          snapshot: input.snapshot,
          symbolIdsByFileId: input.indexes.symbolIdsByFileId,
        }).filter((nodeId) => visibleNodeIdSet.has(nodeId))
      : []

  const rangeMatchedSymbolIds =
    input.mode === 'symbols'
      ? getPreferredFollowSymbolIdsForOperationRanges({
          fileId: fileNodeId,
          operationRanges: input.sourceEvent.operationRanges ?? [],
          snapshot: input.snapshot,
          symbolIdsByFileId: input.indexes.symbolIdsByFileId,
        })
      : []

  const fallbackSymbolIds =
    rangeMatchedSymbolIds.length > 0
      ? rangeMatchedSymbolIds
      : visibleSymbolIds.length > 0
        ? visibleSymbolIds
        : input.mode === 'symbols'
          ? getPreferredFollowSymbolIdsForFile({
              fileId: fileNodeId,
              snapshot: input.snapshot,
              symbolIdsByFileId: input.indexes.symbolIdsByFileId,
            })
          : []

  if (fallbackSymbolIds.length > 0 && input.mode === 'symbols') {
    const confidence: FollowTargetConfidence =
      fallbackSymbolIds.length === 1 && rangeMatchedSymbolIds.length === 0
        ? 'exact_symbol'
        : 'best_named_symbol'

    return {
      pendingPath: null,
      sourceEvent: input.sourceEvent,
      target: {
        confidence,
        eventKey: input.sourceEvent.eventKey,
        fileNodeId,
        intent: input.intent,
        kind: 'symbol',
        operationRanges: input.sourceEvent.operationRanges,
        path: input.sourceEvent.path,
        primaryNodeId: fallbackSymbolIds[0],
        requiresSnapshotRefresh: input.intent === 'edit' && input.viewMode === 'symbols',
        shouldOpenInspector: true,
        symbolNodeIds: fallbackSymbolIds,
        timestamp: input.sourceEvent.timestamp,
        toolNames: input.sourceEvent.toolNames,
      },
    }
  }

  const fileIsVisible = visibleNodeIdSet.has(fileNodeId)

  if (!fileIsVisible && !input.allowInvisibleFileFallback) {
    return null
  }

  return {
    pendingPath: null,
    sourceEvent: input.sourceEvent,
    target: {
      confidence:
        input.sourceEvent.key.startsWith('dirty:')
          ? 'dirty_file_fallback'
          : 'file_fallback',
      eventKey: input.sourceEvent.eventKey,
      fileNodeId,
      intent: input.intent,
      kind: 'file',
      operationRanges: input.sourceEvent.operationRanges,
      path: input.sourceEvent.path,
      primaryNodeId: fileNodeId,
      requiresSnapshotRefresh: input.intent === 'edit' && input.viewMode === 'symbols',
      shouldOpenInspector: true,
      symbolNodeIds: [],
      timestamp: input.sourceEvent.timestamp,
      toolNames: input.sourceEvent.toolNames,
    },
  }
}

function getValidExplicitSymbolIds(input: {
  fileNodeId: string
  snapshot: ProjectSnapshot
  symbolNodeIds: string[]
}) {
  return [...new Set(input.symbolNodeIds)]
    .filter((nodeId) => {
      const node = input.snapshot.nodes[nodeId]

      return Boolean(
        node &&
        isSymbolNode(node) &&
        node.fileId === input.fileNodeId,
      )
    })
}

function getPreferredFollowSymbolIdsForOperationRanges(input: {
  fileId: string
  operationRanges: AgentFileOperationRange[]
  snapshot: ProjectSnapshot
  symbolIdsByFileId: Map<string, string[]>
}) {
  if (input.operationRanges.length === 0) {
    return []
  }

  const symbols = (input.symbolIdsByFileId.get(input.fileId) ?? [])
    .map((symbolId) => input.snapshot.nodes[symbolId])
    .filter(isSymbolNode)
  const candidateRanges = input.operationRanges
    .filter((range) => !range.path || range.path === getFilePath(input.snapshot, input.fileId))
    .map((range) => range.range)

  if (symbols.length === 0 || candidateRanges.length === 0) {
    return []
  }

  return symbols
    .map((symbol) => ({
      overlap: Math.max(
        ...candidateRanges.map((range) => getLineRangeOverlap(symbol.range, range)),
      ),
      symbol,
    }))
    .filter(({ overlap }) => overlap > 0)
    .sort((left, right) => {
      if (left.overlap !== right.overlap) {
        return right.overlap - left.overlap
      }

      const leftLine = left.symbol.range?.start.line ?? Number.MAX_SAFE_INTEGER
      const rightLine = right.symbol.range?.start.line ?? Number.MAX_SAFE_INTEGER

      if (leftLine !== rightLine) {
        return leftLine - rightLine
      }

      return left.symbol.id.localeCompare(right.symbol.id)
    })
    .map(({ symbol }) => symbol.id)
}

function getFilePath(snapshot: ProjectSnapshot, fileId: string) {
  const file = snapshot.nodes[fileId]
  return file?.path ?? null
}

function getLineRangeOverlap(
  left: AgentFileOperationRange['range'] | undefined,
  right: AgentFileOperationRange['range'],
) {
  if (!left) {
    return 0
  }

  const startLine = Math.max(left.start.line, right.start.line)
  const endLine = Math.min(left.end.line, right.end.line)

  return Math.max(0, endLine - startLine + 1)
}

function getFollowTargetMode(viewMode: VisualizerViewMode): TelemetryMode {
  return viewMode === 'symbols' ? 'symbols' : 'files'
}

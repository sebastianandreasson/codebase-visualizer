import type { Node } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import {
  createLifecycleFollowEvent,
  createViewChangedFollowEvent,
  getChangedDirtySignalPaths,
  getChangedFileOperationPaths,
} from './events'
import {
  createInitialFollowControllerState,
  deriveFollowControllerView,
  followControllerReducer,
} from './model'
import { buildSnapshotSignature, countSnapshotSymbols } from './snapshot'
import type {
  DirtyFileEditSignal,
  FollowControllerContext,
  FollowIntent,
} from './types'
import type {
  AgentFileOperation,
  ProjectSnapshot,
  TelemetryActivityEvent,
  TelemetryMode,
  VisualizerViewMode,
} from '../../types'

interface UseAgentFollowControllerInput {
  dirtyFileEditSignals: DirtyFileEditSignal[]
  enabled: boolean
  fileOperations: AgentFileOperation[]
  liveChangedFiles: string[]
  snapshot: ProjectSnapshot | null
  telemetryActivityEvents: TelemetryActivityEvent[]
  telemetryEnabled: boolean
  telemetryMode: TelemetryMode
  viewMode: VisualizerViewMode
  visibleNodes: Node[]
}

export function useAgentFollowController(
  input: UseAgentFollowControllerInput,
) {
  const visibleNodeIds = useMemo(
    () => input.visibleNodes.map((node) => node.id),
    [input.visibleNodes],
  )
  const context = useMemo<FollowControllerContext>(
    () => ({
      dirtyFileEditSignals: input.dirtyFileEditSignals,
      enabled: input.enabled,
      fileOperations: input.fileOperations,
      liveChangedFiles: input.liveChangedFiles,
      snapshot: input.snapshot,
      telemetryActivityEvents: input.telemetryActivityEvents,
      telemetryEnabled: input.telemetryEnabled,
      telemetryMode: input.telemetryMode,
      viewMode: input.viewMode,
      visibleNodeIds,
    }),
    [
      input.dirtyFileEditSignals,
      input.enabled,
      input.fileOperations,
      input.liveChangedFiles,
      input.snapshot,
      input.telemetryActivityEvents,
      input.telemetryEnabled,
      input.telemetryMode,
      input.viewMode,
      visibleNodeIds,
    ],
  )
  const [state, dispatch] = useReducer(
    followControllerReducer,
    undefined,
    createInitialFollowControllerState,
  )
  const previousDirtyFileSignalsRef = useRef(input.dirtyFileEditSignals)
  const previousFileOperationsRef = useRef(input.fileOperations)
  const previousLiveChangedFilesRef = useRef(input.liveChangedFiles)
  const previousSnapshotMetaRef = useRef({
    signature: null as string | null,
    symbolCount: 0,
  })
  const previousTelemetryModeRef = useRef<TelemetryMode>('files')
  const view = useMemo(
    () => deriveFollowControllerView(state, context),
    [context, state],
  )

  useEffect(() => {
    dispatch({
      type: 'FOLLOW_TOGGLED',
      enabled: input.enabled,
      nowMs: Date.now(),
    })
  }, [input.enabled])

  useEffect(() => {
    const previousOperations = previousFileOperationsRef.current
    previousFileOperationsRef.current = input.fileOperations

    if (!input.enabled) {
      return
    }

    const reprioritizedPaths = getChangedFileOperationPaths({
      nextOperations: input.fileOperations,
      previousOperations,
    })

    if (reprioritizedPaths.length === 0) {
      return
    }

    dispatch({
      type: 'DIRTY_PATHS_RECONCILED',
      liveChangedFiles: input.liveChangedFiles,
      nowMs: Date.now(),
      previousChangedPaths: input.liveChangedFiles,
      reprioritizedPaths,
      telemetryActivityEvents: input.telemetryActivityEvents,
    })
  }, [
    input.enabled,
    input.fileOperations,
    input.liveChangedFiles,
    input.telemetryActivityEvents,
  ])

  useEffect(() => {
    const previousChangedPaths = previousLiveChangedFilesRef.current
    previousLiveChangedFilesRef.current = input.liveChangedFiles

    if (!input.enabled) {
      return
    }

    dispatch({
      type: 'DIRTY_PATHS_RECONCILED',
      liveChangedFiles: input.liveChangedFiles,
      nowMs: Date.now(),
      previousChangedPaths,
      reprioritizedPaths: [],
      telemetryActivityEvents: input.telemetryActivityEvents,
    })
  }, [input.enabled, input.liveChangedFiles, input.telemetryActivityEvents])

  useEffect(() => {
    const previousSignals = previousDirtyFileSignalsRef.current
    previousDirtyFileSignalsRef.current = input.dirtyFileEditSignals

    if (!input.enabled) {
      return
    }

    const reprioritizedPaths = getChangedDirtySignalPaths({
      nextSignals: input.dirtyFileEditSignals,
      previousSignals,
    })

    if (reprioritizedPaths.length === 0) {
      return
    }

    dispatch({
      type: 'DIRTY_PATHS_RECONCILED',
      liveChangedFiles: input.liveChangedFiles,
      nowMs: Date.now(),
      previousChangedPaths: input.liveChangedFiles,
      reprioritizedPaths,
      telemetryActivityEvents: input.telemetryActivityEvents,
    })
  }, [
    input.dirtyFileEditSignals,
    input.enabled,
    input.liveChangedFiles,
    input.telemetryActivityEvents,
  ])

  useEffect(() => {
    const previousSnapshotMeta = previousSnapshotMetaRef.current
    const nextSnapshotMeta = {
      signature: buildSnapshotSignature(input.snapshot),
      symbolCount: countSnapshotSymbols(input.snapshot),
    }
    previousSnapshotMetaRef.current = nextSnapshotMeta

    if (nextSnapshotMeta.signature === previousSnapshotMeta.signature) {
      return
    }

    const nowMs = Date.now()
    dispatch({
      type: 'FOLLOW_EVENT_RECORDED',
      event: createLifecycleFollowEvent(
        nextSnapshotMeta.symbolCount > previousSnapshotMeta.symbolCount
          ? 'symbols_available'
          : 'snapshot_refreshed',
        nowMs,
      ),
      nowMs,
    })
  }, [input.snapshot])

  useEffect(() => {
    const previousMode = previousTelemetryModeRef.current
    previousTelemetryModeRef.current = input.telemetryMode

    if (input.telemetryMode === previousMode) {
      return
    }

    const nowMs = Date.now()
    dispatch({
      type: 'FOLLOW_EVENT_RECORDED',
      event: createViewChangedFollowEvent(input.telemetryMode, nowMs),
      nowMs,
    })
  }, [input.telemetryMode])

  useEffect(() => {
    if (!input.enabled || state.cameraLockUntilMs <= state.nowMs) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      dispatch({
        type: 'CLOCK_TICKED',
        nowMs: Date.now(),
      })
    }, Math.max(0, state.cameraLockUntilMs - state.nowMs))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [input.enabled, state.cameraLockUntilMs, state.nowMs])

  const acknowledgeCameraCommand = useCallback((input: {
    commandId: string
    intent: FollowIntent
  }) => {
    dispatch({
      type: 'COMMAND_ACKNOWLEDGED',
      commandId: input.commandId,
      commandType: 'camera',
      intent: input.intent,
      nowMs: Date.now(),
    })
  }, [])

  const acknowledgeInspectorCommand = useCallback((input: {
    commandId: string
    pendingPath?: string | null
  }) => {
    dispatch({
      type: 'COMMAND_ACKNOWLEDGED',
      commandId: input.commandId,
      commandType: 'inspector',
      nowMs: Date.now(),
      pendingPath: input.pendingPath ?? null,
    })
  }, [])

  const acknowledgeRefreshCommand = useCallback((commandId: string) => {
    dispatch({
      type: 'COMMAND_ACKNOWLEDGED',
      commandId,
      commandType: 'refresh',
      nowMs: Date.now(),
    })
  }, [])

  const setRefreshStatus = useCallback((status: 'idle' | 'in_flight') => {
    dispatch({
      type: 'REFRESH_STATUS_CHANGED',
      nowMs: Date.now(),
      status,
    })
  }, [])

  return {
    cameraCommand: view.cameraCommand,
    debugState: view.debug,
    inspectorCommand: view.inspectorCommand,
    refreshCommand: view.refreshCommand,
    acknowledgeCameraCommand,
    acknowledgeInspectorCommand,
    acknowledgeRefreshCommand,
    setRefreshStatus,
  }
}

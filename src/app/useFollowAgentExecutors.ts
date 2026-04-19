import { useEffect, useRef, useState } from 'react'

import type {
  FollowCameraCommand,
  FollowInspectorCommand,
  FollowRefreshCommand,
  TelemetryMode,
} from '../types'

const LIVE_SNAPSHOT_REFRESH_DEBOUNCE_MS = 500
const LIVE_SNAPSHOT_REFRESH_MIN_INTERVAL_MS = 1800

interface FocusFollowTargetInput {
  fileNodeId: string
  isEdit: boolean
  mode: TelemetryMode
  nodeIds: string[]
}

interface UseFollowAgentExecutorsOptions {
  active: boolean
  acknowledgeCameraCommand: (input: {
    commandId: string
    intent: 'activity' | 'edit'
  }) => void
  acknowledgeInspectorCommand: (input: {
    commandId: string
    pendingPath?: string | null
  }) => void
  acknowledgeRefreshCommand: (commandId: string) => void
  cameraCommand: FollowCameraCommand | null
  canMoveCamera: boolean
  focusCanvasOnFollowTarget: (input: FocusFollowTargetInput) => void
  inspectorCommand: FollowInspectorCommand | null
  onLiveWorkspaceRefresh?: (() => Promise<void>) | null
  refreshCommand: FollowRefreshCommand | null
  selectFileNode: (nodeId: string) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTabToFile: () => void
  setRefreshStatus: (status: 'idle' | 'in_flight') => void
  telemetryMode: TelemetryMode
}

export function useFollowAgentExecutors({
  active,
  acknowledgeCameraCommand,
  acknowledgeInspectorCommand,
  acknowledgeRefreshCommand,
  cameraCommand,
  canMoveCamera,
  focusCanvasOnFollowTarget,
  inspectorCommand,
  onLiveWorkspaceRefresh,
  refreshCommand,
  selectFileNode,
  setInspectorOpen,
  setInspectorTabToFile,
  setRefreshStatus,
  telemetryMode,
}: UseFollowAgentExecutorsOptions) {
  const [followedEditDiffRequestKey, setFollowedEditDiffRequestKey] = useState<string | null>(null)
  const refreshExecutorTimeoutRef = useRef<number | null>(null)
  const lastRefreshExecutorAtRef = useRef(0)

  useEffect(() => {
    if (active) {
      return
    }

    let cancelled = false
    window.setTimeout(() => {
      if (!cancelled) {
        setFollowedEditDiffRequestKey(null)
      }
    }, 0)

    return () => {
      cancelled = true
    }
  }, [active])

  useEffect(() => {
    if (!active || !canMoveCamera || !cameraCommand) {
      return
    }

    window.setTimeout(() => {
      focusCanvasOnFollowTarget({
        fileNodeId: cameraCommand.target.fileNodeId,
        isEdit: cameraCommand.target.intent === 'edit',
        mode: telemetryMode,
        nodeIds:
          cameraCommand.target.kind === 'symbol'
            ? [cameraCommand.target.primaryNodeId]
            : [cameraCommand.target.fileNodeId],
      })
      acknowledgeCameraCommand({
        commandId: cameraCommand.id,
        intent: cameraCommand.target.intent,
      })
    }, 0)
  }, [
    acknowledgeCameraCommand,
    active,
    cameraCommand,
    canMoveCamera,
    focusCanvasOnFollowTarget,
    telemetryMode,
  ])

  useEffect(() => {
    if (!active || !inspectorCommand) {
      return
    }

    const target = inspectorCommand.target

    window.setTimeout(() => {
      const focusedNodeIds =
        telemetryMode === 'symbols'
          ? target.kind === 'symbol'
            ? [target.primaryNodeId]
            : [target.fileNodeId]
          : [target.fileNodeId]

      selectFileNode(target.fileNodeId)
      setInspectorTabToFile()
      setInspectorOpen(true)
      setFollowedEditDiffRequestKey(inspectorCommand.scrollToDiffRequestKey)
      focusCanvasOnFollowTarget({
        fileNodeId: target.fileNodeId,
        isEdit: true,
        mode: telemetryMode,
        nodeIds: focusedNodeIds,
      })
      acknowledgeInspectorCommand({
        commandId: inspectorCommand.id,
        pendingPath: inspectorCommand.pendingPath,
      })
    }, 0)
  }, [
    acknowledgeInspectorCommand,
    active,
    focusCanvasOnFollowTarget,
    inspectorCommand,
    selectFileNode,
    setInspectorOpen,
    setInspectorTabToFile,
    telemetryMode,
  ])

  useEffect(() => {
    if (!active || !refreshCommand || !onLiveWorkspaceRefresh) {
      return
    }

    acknowledgeRefreshCommand(refreshCommand.id)

    if (refreshExecutorTimeoutRef.current !== null) {
      window.clearTimeout(refreshExecutorTimeoutRef.current)
      refreshExecutorTimeoutRef.current = null
    }

    const now = Date.now()
    const earliestAllowedAt =
      lastRefreshExecutorAtRef.current + LIVE_SNAPSHOT_REFRESH_MIN_INTERVAL_MS
    const delay = Math.max(
      LIVE_SNAPSHOT_REFRESH_DEBOUNCE_MS,
      Math.max(0, earliestAllowedAt - now),
    )

    refreshExecutorTimeoutRef.current = window.setTimeout(() => {
      refreshExecutorTimeoutRef.current = null
      lastRefreshExecutorAtRef.current = Date.now()
      setRefreshStatus('in_flight')

      void onLiveWorkspaceRefresh()
        .catch(() => undefined)
        .finally(() => {
          setRefreshStatus('idle')
        })
    }, delay)

    return () => {
      if (refreshExecutorTimeoutRef.current !== null) {
        window.clearTimeout(refreshExecutorTimeoutRef.current)
        refreshExecutorTimeoutRef.current = null
        setRefreshStatus('idle')
      }
    }
  }, [
    acknowledgeRefreshCommand,
    active,
    onLiveWorkspaceRefresh,
    refreshCommand,
    setRefreshStatus,
  ])

  return {
    clearFollowedEditDiffRequestKey: () => setFollowedEditDiffRequestKey(null),
    followedEditDiffRequestKey,
  }
}

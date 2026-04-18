import type { Node } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  ProjectSnapshot,
  TelemetryActivityEvent,
  TelemetryMode,
} from '../types'
import {
  buildPendingEditedTargetFromPath,
  computePendingEditedPaths,
  getLatestAgentActivityTarget,
  getLatestEditedActivityTarget,
  type FollowTarget,
} from './agentFollowModel'

export interface FollowActivityCommand {
  key: string
  target: FollowTarget
}

export interface FollowEditCommand {
  diffRequestKey: string
  key: string
  pendingPath: string | null
  target: FollowTarget
}

interface UseAgentFollowControllerInput {
  enabled: boolean
  liveChangedFiles: string[]
  snapshot: ProjectSnapshot | null
  telemetryActivityEvents: TelemetryActivityEvent[]
  telemetryEnabled: boolean
  telemetryMode: TelemetryMode
  visibleNodes: Node[]
}

export function useAgentFollowController(
  input: UseAgentFollowControllerInput,
) {
  const knownChangedPathsRef = useRef<Set<string>>(new Set())
  const [pendingEditedPaths, setPendingEditedPaths] = useState<string[]>([])
  const [lastHandledActivityKey, setLastHandledActivityKey] = useState<string | null>(
    null,
  )
  const [lastHandledEditKey, setLastHandledEditKey] = useState<string | null>(null)

  useEffect(() => {
    if (!input.enabled) {
      knownChangedPathsRef.current = new Set()
      return
    }

    setPendingEditedPaths((currentPendingPaths) =>
      computePendingEditedPaths({
        currentPendingPaths,
        liveChangedFiles: input.liveChangedFiles,
        previousChangedPaths: knownChangedPathsRef.current,
        telemetryActivityEvents: input.telemetryActivityEvents,
      }),
    )
    knownChangedPathsRef.current = new Set(input.liveChangedFiles)
  }, [input.enabled, input.liveChangedFiles, input.telemetryActivityEvents])

  const latestAgentActivityTarget = useMemo(
    () =>
      getLatestAgentActivityTarget({
        snapshot: input.snapshot,
        telemetryActivityEvents: input.telemetryActivityEvents,
        telemetryEnabled: input.telemetryEnabled,
        telemetryMode: input.telemetryMode,
        visibleNodes: input.visibleNodes,
      }),
    [
      input.snapshot,
      input.telemetryActivityEvents,
      input.telemetryEnabled,
      input.telemetryMode,
      input.visibleNodes,
    ],
  )

  const latestAgentEditedTarget = useMemo(
    () =>
      getLatestEditedActivityTarget({
        changedPaths: input.liveChangedFiles,
        snapshot: input.snapshot,
        telemetryActivityEvents: input.telemetryActivityEvents,
        telemetryEnabled: input.telemetryEnabled,
        telemetryMode: input.telemetryMode,
        visibleNodes: input.visibleNodes,
      }),
    [
      input.liveChangedFiles,
      input.snapshot,
      input.telemetryActivityEvents,
      input.telemetryEnabled,
      input.telemetryMode,
      input.visibleNodes,
    ],
  )

  const pendingEditedPath = input.enabled ? pendingEditedPaths[0] ?? null : null
  const pendingEditedTarget = useMemo(() => {
    if (!pendingEditedPath || !input.snapshot) {
      return null
    }

    return (
      getLatestAgentActivityTarget({
        changedPaths: [pendingEditedPath],
        snapshot: input.snapshot,
        telemetryActivityEvents: input.telemetryActivityEvents,
        telemetryEnabled: true,
        telemetryMode: input.telemetryMode,
        visibleNodes: input.visibleNodes,
      }) ??
      buildPendingEditedTargetFromPath({
        path: pendingEditedPath,
        snapshot: input.snapshot,
        telemetryMode: input.telemetryMode,
        visibleNodes: input.visibleNodes,
      })
    )
  }, [
    input.snapshot,
    input.telemetryActivityEvents,
    input.telemetryMode,
    input.visibleNodes,
    pendingEditedPath,
  ])

  const nextEditTarget = pendingEditedTarget ?? latestAgentEditedTarget

  const activityCommand = useMemo<FollowActivityCommand | null>(() => {
    if (!input.enabled || !latestAgentActivityTarget) {
      return null
    }

    const key = `${input.telemetryMode}:${latestAgentActivityTarget.eventKey}`

    if (lastHandledActivityKey === key) {
      return null
    }

    return {
      key,
      target: latestAgentActivityTarget,
    }
  }, [input.enabled, input.telemetryMode, lastHandledActivityKey, latestAgentActivityTarget])

  const editCommand = useMemo<FollowEditCommand | null>(() => {
    if (!input.enabled || !nextEditTarget) {
      return null
    }

    const key = `edit:${nextEditTarget.eventKey}`

    if (lastHandledEditKey === key) {
      return null
    }

    return {
      diffRequestKey: key,
      key,
      pendingPath: pendingEditedTarget ? pendingEditedPath : null,
      target: nextEditTarget,
    }
  }, [input.enabled, lastHandledEditKey, nextEditTarget, pendingEditedPath, pendingEditedTarget])

  const acknowledgeActivityCommand = useCallback((key: string) => {
    setLastHandledActivityKey(key)
  }, [])

  const acknowledgeEditCommand = useCallback((input: {
    key: string
    pendingPath: string | null
  }) => {
    setLastHandledEditKey(input.key)

    if (!input.pendingPath) {
      return
    }

    setPendingEditedPaths((currentPendingPaths) =>
      currentPendingPaths.filter((path) => path !== input.pendingPath),
    )
  }, [])

  const resetFollowState = useCallback(() => {
    knownChangedPathsRef.current = new Set()
    setPendingEditedPaths([])
    setLastHandledActivityKey(null)
    setLastHandledEditKey(null)
  }, [])

  return {
    activityCommand,
    editCommand,
    latestAgentActivityTarget,
    latestAgentEditedTarget,
    pendingEditedPathCount: pendingEditedPaths.length,
    resetFollowState,
    acknowledgeActivityCommand,
    acknowledgeEditCommand,
  }
}

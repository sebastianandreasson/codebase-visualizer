import type { VisualizerViewMode } from '../../schema/layout'
import type {
  FollowCameraCommand,
  FollowDebugState,
  FollowDomainEvent,
  FollowInspectorCommand,
  FollowIntent,
  FollowRefreshStatus,
  FollowRefreshCommand,
  FollowTarget,
} from './types'

export const FOLLOW_AGENT_EDIT_CAMERA_LOCK_MS = 1400
const MAX_ACKNOWLEDGED_COMMAND_IDS = 300

export function buildCameraCommand(input: {
  acknowledgedCommandIds: string[]
  activityTargets: FollowTarget[]
  cameraLockUntilMs: number
  editTargets: FollowTarget[]
  nowMs: number
}) {
  const acknowledgedCommandIds = new Set(input.acknowledgedCommandIds)

  const candidateTargets = input.editTargets.length > 0
    ? input.editTargets
    : input.cameraLockUntilMs <= input.nowMs
      ? input.activityTargets
      : []

  const target = candidateTargets.find((candidateTarget) => {
    const commandId = createCameraCommandId(candidateTarget)
    return !acknowledgedCommandIds.has(commandId)
  }) ?? null

  if (!target) {
    return null
  }

  return {
    id: createCameraCommandId(target),
    target,
  } satisfies FollowCameraCommand
}

export function buildInspectorCommand(input: {
  acknowledgedCommandIds: string[]
  pendingPath: string | null
  target: FollowTarget | null
}) {
  if (!input.target?.shouldOpenInspector) {
    return null
  }

  const commandId = createInspectorCommandId(input.target)

  if (input.acknowledgedCommandIds.includes(commandId)) {
    return null
  }

  return {
    id: commandId,
    pendingPath: input.target.intent === 'edit' ? input.pendingPath : null,
    scrollToDiffRequestKey:
      input.target.intent === 'edit' ? `edit:${input.target.eventKey}` : null,
    target: input.target,
  } satisfies FollowInspectorCommand
}

export function buildRefreshCommand(input: {
  acknowledgedCommandIds: string[]
  editTarget: FollowTarget | null
  refreshStatus: FollowRefreshStatus
  viewMode: VisualizerViewMode
}) {
  if (
    !input.editTarget?.requiresSnapshotRefresh ||
    input.viewMode !== 'symbols' ||
    input.refreshStatus !== 'idle'
  ) {
    return null
  }

  const commandId = `refresh:${input.editTarget.path}:${input.editTarget.eventKey}`

  if (input.acknowledgedCommandIds.includes(commandId)) {
    return null
  }

  return {
    id: commandId,
    target: input.editTarget,
  } satisfies FollowRefreshCommand
}

export function buildFollowDebugState(input: {
  cameraLockUntilMs: number
  currentMode: FollowIntent | 'idle'
  currentTarget: FollowTarget | null
  latestEvent: FollowDomainEvent | null
  queueLength: number
  refreshInFlight: boolean
  refreshPending: boolean
  nowMs: number
}) {
  return {
    cameraLockActive: input.cameraLockUntilMs > input.nowMs,
    cameraLockUntilMs: input.cameraLockUntilMs,
    currentMode: input.currentMode,
    currentTarget: input.currentTarget,
    latestEvent: input.latestEvent,
    queueLength: input.queueLength,
    refreshInFlight: input.refreshInFlight,
    refreshPending: input.refreshPending,
  } satisfies FollowDebugState
}

export function createCameraCommandId(target: FollowTarget) {
  return `camera:${target.intent}:${target.eventKey}:${target.primaryNodeId}:${target.confidence}`
}

export function appendAcknowledgedCommandId(
  acknowledgedCommandIds: string[],
  commandId: string,
) {
  return [
    ...acknowledgedCommandIds.filter((acknowledgedCommandId) => acknowledgedCommandId !== commandId),
    commandId,
  ].slice(-MAX_ACKNOWLEDGED_COMMAND_IDS)
}

export function countQueuedCameraTargets(input: {
  acknowledgedCommandIds: string[]
  currentCommand: FollowCameraCommand | null
  targets: FollowTarget[]
}) {
  const acknowledgedCommandIds = new Set(input.acknowledgedCommandIds)
  const currentCommandId = input.currentCommand?.id ?? null

  return input.targets.filter((target) => {
    const commandId = createCameraCommandId(target)
    return commandId !== currentCommandId && !acknowledgedCommandIds.has(commandId)
  }).length
}

function createInspectorCommandId(target: FollowTarget) {
  return `inspector:${target.intent}:${target.path}:${target.eventKey}`
}

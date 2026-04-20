import type { AgentFileOperation } from '../../schema/agent'
import type { VisualizerViewMode } from '../../schema/layout'
import type { ProjectSnapshot } from '../../schema/snapshot'
import type { TelemetryActivityEvent, TelemetryMode } from '../../schema/telemetry'

export type FollowTargetKind = 'symbol' | 'file'
export type FollowTargetConfidence =
  | 'exact_symbol'
  | 'best_named_symbol'
  | 'file_fallback'
  | 'dirty_file_fallback'
export type FollowIntent = 'activity' | 'edit'

export interface DirtyFileEditSignal {
  changedAt: string
  changedAtMs: number
  fingerprint: string
  path: string
}

export type FollowDomainEvent =
  | {
      type: 'file_touched' | 'file_edited'
      key: string
      eventKey: string
      path: string
      timestamp: string
      timestampMs: number
      toolNames: string[]
      sourcePriority: number
      sourceSequence: number
    }
  | {
      type: 'snapshot_refreshed' | 'symbols_available'
      key: string
      timestamp: string
      timestampMs: number
    }
  | {
      type: 'follow_enabled' | 'follow_disabled'
      key: string
      timestamp: string
      timestampMs: number
    }
  | {
      type: 'view_changed'
      key: string
      mode: TelemetryMode
      timestamp: string
      timestampMs: number
    }

export interface FollowTarget {
  kind: FollowTargetKind
  path: string
  fileNodeId: string
  symbolNodeIds: string[]
  primaryNodeId: string
  intent: FollowIntent
  confidence: FollowTargetConfidence
  eventKey: string
  toolNames: string[]
  timestamp: string
  requiresSnapshotRefresh: boolean
  shouldOpenInspector: boolean
}

export interface FollowCameraCommand {
  id: string
  target: FollowTarget
}

export interface FollowInspectorCommand {
  id: string
  pendingPath: string | null
  scrollToDiffRequestKey: string | null
  target: FollowTarget
}

export interface FollowRefreshCommand {
  id: string
  target: FollowTarget
}

export interface FollowDebugState {
  cameraLockActive: boolean
  cameraLockUntilMs: number
  currentMode: FollowIntent | 'idle'
  currentTarget: FollowTarget | null
  latestEvent: FollowDomainEvent | null
  queueLength: number
  refreshInFlight: boolean
  refreshPending: boolean
}

export interface FollowControllerContext {
  enabled: boolean
  telemetryEnabled: boolean
  telemetryMode: TelemetryMode
  viewMode: VisualizerViewMode
  snapshot: ProjectSnapshot | null
  visibleNodeIds: string[]
  fileOperations: AgentFileOperation[]
  telemetryActivityEvents: TelemetryActivityEvent[]
  liveChangedFiles: string[]
  dirtyFileEditSignals: DirtyFileEditSignal[]
}

export type FollowRefreshStatus = 'idle' | 'pending' | 'in_flight'

export interface FollowControllerState {
  pendingDirtyPaths: string[]
  cameraLockUntilMs: number
  refreshStatus: FollowRefreshStatus
  acknowledgedCommandIds: string[]
  latestEvent: FollowDomainEvent | null
  nowMs: number
}

export interface FollowControllerView {
  cameraCommand: FollowCameraCommand | null
  inspectorCommand: FollowInspectorCommand | null
  refreshCommand: FollowRefreshCommand | null
  debug: FollowDebugState
  latestResolvedActivityTarget: FollowTarget | null
  latestResolvedEditTarget: FollowTarget | null
}

export type FollowControllerAction =
  | {
      type: 'FOLLOW_TOGGLED'
      enabled: boolean
      nowMs: number
    }
  | {
      type: 'DIRTY_PATHS_RECONCILED'
      liveChangedFiles: string[]
      nowMs: number
      previousChangedPaths: string[]
      reprioritizedPaths: string[]
      telemetryActivityEvents: TelemetryActivityEvent[]
    }
  | {
      type: 'FOLLOW_EVENT_RECORDED'
      event: FollowDomainEvent
      nowMs: number
    }
  | {
      type: 'COMMAND_ACKNOWLEDGED'
      commandId: string
      commandType: 'camera' | 'inspector' | 'refresh'
      intent?: FollowIntent
      nowMs: number
      pendingPath?: string | null
    }
  | {
      type: 'REFRESH_STATUS_CHANGED'
      nowMs: number
      status: 'idle' | 'in_flight'
    }
  | {
      type: 'CLOCK_TICKED'
      nowMs: number
    }

export type FollowFileEvent = Extract<
  FollowDomainEvent,
  { type: 'file_touched' | 'file_edited' }
>

export interface FollowIndexes {
  fileIdsByPath: Map<string, string>
  symbolIdsByFileId: Map<string, string[]>
}

export interface ResolvedFollowTarget {
  pendingPath: string | null
  sourceEvent: FollowFileEvent
  target: FollowTarget
}

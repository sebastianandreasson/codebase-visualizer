import { useEffect, useMemo, useRef, useState } from 'react'

import { DesktopAgentClient } from '../agent/DesktopAgentClient'
import type {
  AgentEvent,
  AgentFileOperation,
  AgentTimelineItem,
  AgentToolInvocation,
  DirtyFileEditSignal,
  FollowDebugState,
  FollowDomainEvent,
  TelemetryActivityEvent,
} from '../types'

const MAX_LIVE_AGENT_EVENTS = 500
const MAX_COMBINED_AGENT_EVENTS = 600

export type AgentDebugFeedSource =
  | 'agent'
  | 'file-operation'
  | 'follow'
  | 'git-dirty'
  | 'telemetry'

export interface AgentDebugFeedEntry {
  detail?: string
  id: string
  path?: string
  payload?: unknown
  source: AgentDebugFeedSource
  status?: string
  symbolNodeIds?: string[]
  timestamp: string
  timestampMs: number
  title: string
  type: string
}

export function useAgentEventFeed() {
  const agentClient = useMemo(() => new DesktopAgentClient(), [])
  const [entries, setEntries] = useState<AgentDebugFeedEntry[]>([])
  const sequenceRef = useRef(0)

  useEffect(() => {
    return agentClient.subscribe((event) => {
      sequenceRef.current += 1
      const entry = createAgentFeedEntry(event, Date.now(), sequenceRef.current)

      setEntries((currentEntries) => {
        return [entry, ...currentEntries].slice(0, MAX_LIVE_AGENT_EVENTS)
      })
    })
  }, [agentClient])

  return entries
}

export function buildAgentDebugFeedEntries(input: {
  agentEvents: AgentDebugFeedEntry[]
  dirtyFileEditSignals: DirtyFileEditSignal[]
  fileOperations: AgentFileOperation[]
  followDebugState: FollowDebugState
  telemetryActivityEvents: TelemetryActivityEvent[]
}) {
  return [
    ...input.agentEvents,
    ...input.fileOperations.map(createFileOperationFeedEntry),
    ...input.telemetryActivityEvents.map(createTelemetryFeedEntry),
    ...input.dirtyFileEditSignals.map(createDirtySignalFeedEntry),
    ...createFollowFeedEntries(input.followDebugState),
  ]
    .sort(compareFeedEntriesDescending)
    .slice(0, MAX_COMBINED_AGENT_EVENTS)
}

function createAgentFeedEntry(
  event: AgentEvent,
  nowMs: number,
  sequence: number,
): AgentDebugFeedEntry {
  const timestamp = new Date(nowMs).toISOString()
  const base = {
    id: `agent:${sequence}:${event.type}`,
    payload: event,
    source: 'agent' as const,
    timestamp,
    timestampMs: nowMs,
    type: event.type,
  }

  switch (event.type) {
    case 'session_created':
    case 'session_updated':
      return {
        ...base,
        detail: `${event.session.provider}/${event.session.modelId}`,
        status: event.session.runState,
        title: event.type.replace('_', ' '),
      }
    case 'message':
      return {
        ...base,
        detail: summarizeAgentMessage(event.message.blocks.map((block) => block.text).join('\n')),
        status: event.message.isStreaming ? 'running' : 'completed',
        title: `message · ${event.message.role}`,
      }
    case 'tool':
      return {
        ...base,
        ...summarizeToolInvocation(event.invocation),
        title: `tool · ${event.invocation.toolName}`,
      }
    case 'file_operation':
      return {
        ...base,
        detail: formatDetailWithSymbols(
          `${event.operation.toolName} · ${event.operation.source}`,
          event.operation.symbolNodeIds,
        ),
        path: event.operation.path,
        status: event.operation.status,
        symbolNodeIds: event.operation.symbolNodeIds,
        title: `file operation · ${event.operation.kind}`,
      }
    case 'timeline':
      return {
        ...base,
        ...summarizeTimelineItem(event.item),
      }
    case 'timeline_snapshot':
      return {
        ...base,
        detail: `${event.items.length} items · rev ${event.revision}`,
        title: 'timeline snapshot',
      }
    case 'permission_request':
      return {
        ...base,
        detail: event.request.description,
        title: 'permission request',
      }
  }
}

function createFileOperationFeedEntry(operation: AgentFileOperation): AgentDebugFeedEntry {
  const timestampMs = parseTimestampMs(operation.timestamp)

  return {
    detail: formatDetailWithSymbols(
      `${operation.toolName} · ${operation.source} · ${operation.confidence}`,
      operation.symbolNodeIds,
    ),
    id: `file-operation:${operation.id}`,
    path: operation.path,
    payload: operation,
    source: 'file-operation',
    status: operation.status,
    symbolNodeIds: operation.symbolNodeIds,
    timestamp: operation.timestamp,
    timestampMs,
    title: operation.kind.replace('_', ' '),
    type: operation.kind,
  }
}

function createTelemetryFeedEntry(event: TelemetryActivityEvent): AgentDebugFeedEntry {
  const timestampMs = parseTimestampMs(event.timestamp)

  return {
    detail: formatDetailWithSymbols(
      `${event.toolNames.join(', ') || 'request'} · ${Math.round(event.totalTokens)} tok · ${event.confidence}`,
      event.symbolNodeIds,
    ),
    id: `telemetry:${event.key}`,
    path: event.path,
    payload: event,
    source: 'telemetry',
    symbolNodeIds: event.symbolNodeIds,
    timestamp: event.timestamp,
    timestampMs,
    title: 'telemetry activity',
    type: 'telemetry_activity',
  }
}

function createDirtySignalFeedEntry(signal: DirtyFileEditSignal): AgentDebugFeedEntry {
  return {
    detail: signal.fingerprint,
    id: `dirty:${signal.path}:${signal.fingerprint}`,
    path: signal.path,
    payload: signal,
    source: 'git-dirty',
    status: 'changed',
    timestamp: signal.changedAt,
    timestampMs: signal.changedAtMs,
    title: 'dirty file signal',
    type: 'dirty_file',
  }
}

function createFollowFeedEntries(debugState: FollowDebugState): AgentDebugFeedEntry[] {
  const entries: AgentDebugFeedEntry[] = []
  const latestEvent = debugState.latestEvent

  if (latestEvent) {
    entries.push({
      detail: formatFollowEventDetail(latestEvent),
      id: `follow:event:${latestEvent.key}`,
      path: 'path' in latestEvent ? latestEvent.path : undefined,
      payload: latestEvent,
      source: 'follow',
      timestamp: latestEvent.timestamp,
      timestampMs: latestEvent.timestampMs,
      title: `follow event · ${latestEvent.type}`,
      type: latestEvent.type,
    })
  }

  if (debugState.currentTarget) {
    entries.push({
      detail: `${debugState.currentTarget.kind} · ${debugState.currentTarget.confidence}`,
      id: `follow:target:${debugState.currentTarget.eventKey}`,
      path: debugState.currentTarget.path,
      payload: debugState.currentTarget,
      source: 'follow',
      status: debugState.currentMode,
      symbolNodeIds: debugState.currentTarget.symbolNodeIds,
      timestamp: debugState.currentTarget.timestamp,
      timestampMs: parseTimestampMs(debugState.currentTarget.timestamp),
      title: `follow target · ${debugState.currentTarget.intent}`,
      type: 'follow_target',
    })
  }

  return entries
}

function summarizeToolInvocation(invocation: AgentToolInvocation) {
  return {
    detail: formatDetailWithSymbols(summarizeValue(invocation.args), invocation.symbolNodeIds),
    path: invocation.paths?.[0],
    status: invocation.endedAt
      ? invocation.isError
        ? 'error'
        : 'completed'
      : 'running',
    symbolNodeIds: invocation.symbolNodeIds,
  }
}

function summarizeTimelineItem(item: AgentTimelineItem) {
  if (item.type === 'lifecycle') {
    return {
      detail: item.detail,
      status: item.status,
      title: `timeline · ${item.label}`,
    }
  }

  if (item.type === 'tool') {
    return {
      detail: formatDetailWithSymbols(summarizeValue(item.args), item.symbolNodeIds),
      path: item.paths?.[0],
      status: item.status,
      symbolNodeIds: item.symbolNodeIds,
      title: `timeline tool · ${item.toolName}`,
    }
  }

  return {
    detail: summarizeAgentMessage(item.text),
    status: item.isStreaming ? 'running' : 'completed',
    title: `timeline message · ${item.role}`,
  }
}

function summarizeAgentMessage(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (normalized.length <= 180) {
    return normalized
  }

  return `${normalized.slice(0, 177)}...`
}

function summarizeValue(value: unknown) {
  const text = typeof value === 'string'
    ? value
    : safeJsonStringify(value)

  if (!text) {
    return undefined
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function formatDetailWithSymbols(detail: string | undefined, symbolNodeIds: string[] | undefined) {
  const symbolText = formatSymbolCount(symbolNodeIds)

  return [detail, symbolText].filter(Boolean).join(' · ') || undefined
}

function formatSymbolCount(symbolNodeIds: string[] | undefined) {
  const count = symbolNodeIds?.length ?? 0

  if (count === 0) {
    return ''
  }

  return `${count} symbol${count === 1 ? '' : 's'}`
}

function formatFollowEventDetail(event: FollowDomainEvent) {
  if (event.type === 'file_touched' || event.type === 'file_edited') {
    return `${event.path} · ${event.toolNames.join(', ')}`
  }

  if (event.type === 'view_changed') {
    return event.mode
  }

  return undefined
}

function compareFeedEntriesDescending(left: AgentDebugFeedEntry, right: AgentDebugFeedEntry) {
  if (left.timestampMs !== right.timestampMs) {
    return right.timestampMs - left.timestampMs
  }

  return right.id.localeCompare(left.id)
}

function parseTimestampMs(timestamp: string) {
  const timestampMs = new Date(timestamp).getTime()

  return Number.isFinite(timestampMs) ? timestampMs : 0
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

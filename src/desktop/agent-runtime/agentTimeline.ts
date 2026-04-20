import { randomUUID } from 'node:crypto'

import type {
  AgentMessage,
  AgentTimelineItem,
  AgentToolInvocation,
} from '../../schema/agent'
import { deriveToolCodeReferences } from './agentCodeReferences'

const MAX_RESULT_PREVIEW_LENGTH = 1200
const MAX_PATH_COUNT = 8

export function createLifecycleTimelineItem(input: {
  counts?: Record<string, number>
  createdAt?: string
  detail?: string
  event: Extract<AgentTimelineItem, { type: 'lifecycle' }>['event']
  id?: string
  label: string
  status?: Extract<AgentTimelineItem, { type: 'lifecycle' }>['status']
}): AgentTimelineItem {
  return {
    counts: input.counts,
    createdAt: input.createdAt ?? new Date().toISOString(),
    detail: input.detail,
    event: input.event,
    id: input.id ?? `agent-timeline:lifecycle:${randomUUID()}`,
    label: input.label,
    status: input.status,
    type: 'lifecycle',
  }
}

export function createMessageTimelineItems(message: AgentMessage): AgentTimelineItem[] {
  if (message.blocks.length === 0) {
    return [
      {
        blockKind: 'text',
        createdAt: message.createdAt,
        id: `agent-timeline:message:${message.id}:empty`,
        isStreaming: message.isStreaming,
        messageId: message.id,
        role: message.role,
        text: '',
        type: 'message',
      },
    ]
  }

  return message.blocks.map((block, index) => ({
    blockKind: block.kind,
    createdAt: message.createdAt,
    id: `agent-timeline:message:${message.id}:${block.kind}:${index}`,
    isStreaming: message.isStreaming,
    messageId: message.id,
    role: message.role,
    text: block.text,
    type: 'message',
  }))
}

export function createToolTimelineItem(
  invocation: AgentToolInvocation,
): AgentTimelineItem {
  const startedAtMs = new Date(invocation.startedAt).getTime()
  const endedAtMs = invocation.endedAt ? new Date(invocation.endedAt).getTime() : null
  const isError = Boolean(invocation.isError)

  return {
    args: invocation.args,
    createdAt: invocation.startedAt,
    durationMs:
      endedAtMs !== null && Number.isFinite(startedAtMs)
        ? Math.max(0, endedAtMs - startedAtMs)
        : undefined,
    endedAt: invocation.endedAt,
    id: `agent-timeline:tool:${invocation.toolCallId}`,
    isError,
    nodeIds: invocation.nodeIds,
    paths: invocation.paths ?? deriveTimelinePaths(invocation.toolName, invocation.args),
    resultPreview: invocation.resultPreview,
    startedAt: invocation.startedAt,
    status: invocation.endedAt ? (isError ? 'error' : 'completed') : 'running',
    symbolNodeIds: invocation.symbolNodeIds,
    toolCallId: invocation.toolCallId,
    toolName: invocation.toolName,
    type: 'tool',
  }
}

export function normalizeToolInvocation(input: {
  args: unknown
  endedAt?: string
  isError?: boolean
  result?: unknown
  startedAt?: string
  toolCallId: string
  toolName: string
}): AgentToolInvocation {
  const codeReferences = deriveToolCodeReferences(input.toolName, input.args, input.result)

  return {
    args: input.args,
    endedAt: input.endedAt,
    isError: input.isError,
    nodeIds: codeReferences.nodeIds,
    paths: deriveTimelinePaths(input.toolName, input.args, input.result),
    resultPreview: summarizeTimelineValue(input.result),
    startedAt: input.startedAt ?? new Date().toISOString(),
    symbolNodeIds: codeReferences.symbolNodeIds,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
  }
}

export function upsertTimelineItem(
  timeline: AgentTimelineItem[],
  nextItem: AgentTimelineItem,
) {
  if (
    nextItem.type === 'message' &&
    isEmptyMessagePlaceholder(nextItem) &&
    timeline.some(
      (item) =>
        item.type === 'message' &&
        item.messageId === nextItem.messageId &&
        !isEmptyMessagePlaceholder(item),
    )
  ) {
    return timeline
  }

  const normalizedTimeline =
    nextItem.type === 'message'
      ? removeStaleEmptyMessageRows(timeline, nextItem)
      : timeline
  const existingIndex = normalizedTimeline.findIndex((item) => item.id === nextItem.id)

  if (existingIndex === -1) {
    return [...normalizedTimeline, nextItem]
  }

  return normalizedTimeline.map((item, index) =>
    index === existingIndex ? nextItem : item,
  )
}

export function replaceMessageTimelineItems(
  timeline: AgentTimelineItem[],
  message: AgentMessage,
) {
  const nextItems = createMessageTimelineItems(message)
  const firstExistingIndex = timeline.findIndex(
    (item) => item.type === 'message' && item.messageId === message.id,
  )

  if (firstExistingIndex === -1) {
    return [...timeline, ...nextItems]
  }

  const withoutMessage = timeline.filter(
    (item) => !(item.type === 'message' && item.messageId === message.id),
  )
  const insertionIndex = timeline
    .slice(0, firstExistingIndex)
    .filter((item) => !(item.type === 'message' && item.messageId === message.id))
    .length

  return [
    ...withoutMessage.slice(0, insertionIndex),
    ...nextItems,
    ...withoutMessage.slice(insertionIndex),
  ]
}

export function summarizeTimelineValue(value: unknown) {
  if (value === undefined || value === null) {
    return undefined
  }

  const text = typeof value === 'string'
    ? value
    : safeJsonStringify(value)

  if (!text.trim()) {
    return undefined
  }

  return text.length > MAX_RESULT_PREVIEW_LENGTH
    ? `${text.slice(0, MAX_RESULT_PREVIEW_LENGTH)}...`
    : text
}

export function deriveTimelinePaths(
  toolName: string,
  args: unknown,
  result?: unknown,
) {
  const values = new Set<string>()

  collectPathLikeValues(args, values)
  collectPathLikeValues(result, values)

  if (toolName === 'bash' || toolName === 'shell') {
    const command = getObjectString(args, 'command')

    if (command) {
      values.add(command)
    }
  }

  return [...values].slice(0, MAX_PATH_COUNT)
}

function collectPathLikeValues(value: unknown, output: Set<string>) {
  if (!value || output.size >= MAX_PATH_COUNT) {
    return
  }

  if (typeof value === 'string') {
    if (looksPathLike(value)) {
      output.add(value)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathLikeValues(entry, output)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase()
    const keyLooksPathLike =
      normalizedKey === 'path' ||
      normalizedKey === 'paths' ||
      normalizedKey === 'file' ||
      normalizedKey === 'files' ||
      normalizedKey === 'filepath' ||
      normalizedKey === 'file_path' ||
      normalizedKey === 'cwd'

    if (keyLooksPathLike) {
      collectPathLikeValues(entry, output)
      continue
    }

    if (typeof entry === 'object') {
      collectPathLikeValues(entry, output)
    }
  }
}

function getObjectString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ''
  }

  const entry = (value as Record<string, unknown>)[key]
  return typeof entry === 'string' ? entry.trim() : ''
}

function looksPathLike(value: string) {
  const normalized = value.trim()

  if (!normalized || normalized.length > 320) {
    return false
  }

  return (
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    /^[\w.-]+[\\/][\w./\\ -]+$/.test(normalized)
  )
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function removeStaleEmptyMessageRows(
  timeline: AgentTimelineItem[],
  nextItem: Extract<AgentTimelineItem, { type: 'message' }>,
) {
  const nextItemIsEmptyPlaceholder = isEmptyMessagePlaceholder(nextItem)
  const hasConcreteRow = timeline.some(
    (item) =>
      item.type === 'message' &&
      item.messageId === nextItem.messageId &&
      !isEmptyMessagePlaceholder(item),
  )

  if (nextItemIsEmptyPlaceholder && hasConcreteRow) {
    return timeline
  }

  if (nextItemIsEmptyPlaceholder) {
    return timeline
  }

  return timeline.filter(
    (item) =>
      item.type !== 'message' ||
      item.messageId !== nextItem.messageId ||
      !isEmptyMessagePlaceholder(item),
  )
}

function isEmptyMessagePlaceholder(
  item: Extract<AgentTimelineItem, { type: 'message' }>,
) {
  return item.blockKind === 'text' && item.text.length === 0
}

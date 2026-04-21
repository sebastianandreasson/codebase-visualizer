import type { RefObject } from 'react'

import type { AgentTimelineItem } from '../../schema/agent'

export function AgentTerminalTimeline({
  items,
  listRef,
  onScroll,
}: {
  items: AgentTimelineItem[]
  listRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
}) {
  const timelineEntries = buildTimelineEntries(items)

  return (
    <div className="cbv-agent-terminal-timeline" onScroll={onScroll} ref={listRef}>
      {timelineEntries.length > 0 ? (
        timelineEntries.map((entry, index) => (
          <AgentTimelineEntry
            entry={entry}
            isLast={index === timelineEntries.length - 1}
            key={entry.key}
          />
        ))
      ) : (
        <div className="cbv-agent-terminal-empty">
          <span>└ idle · no timeline yet</span>
          <p>Send a prompt or run /resume to attach to a pi session.</p>
        </div>
      )}
    </div>
  )
}

type ActivityTimelineItem =
  | Extract<AgentTimelineItem, { type: 'tool' }>
  | Extract<AgentTimelineItem, { type: 'lifecycle' }>
  | ActivityTimelineMessage

type ActivityTimelineMessage = Extract<AgentTimelineItem, { type: 'message' }> & (
  | { blockKind: 'thinking' }
  | { role: 'tool' }
)

type TimelineEntry =
  | {
      item: AgentTimelineItem
      key: string
      type: 'item'
    }
  | {
      items: ActivityTimelineItem[]
      key: string
      type: 'activity'
    }

type ActivityTimelineEntry = Extract<TimelineEntry, { type: 'activity' }>

function buildTimelineEntries(items: AgentTimelineItem[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  let activeActivityEntry: ActivityTimelineEntry | null = null

  function closeActivityGroup() {
    activeActivityEntry = null
  }

  function addActivityItem(item: ActivityTimelineItem) {
    if (!activeActivityEntry) {
      activeActivityEntry = {
        items: [],
        key: `activity:${item.id}`,
        type: 'activity',
      }
      entries.push(activeActivityEntry)
    }

    activeActivityEntry.items.push(item)
    const firstItem = activeActivityEntry.items[0]
    activeActivityEntry.key = [
      'activity',
      firstItem.id,
      item.id,
      activeActivityEntry.items.length,
    ].join(':')
  }

  for (const item of items) {
    if (isVisibleMessageTimelineItem(item)) {
      closeActivityGroup()
      entries.push({
        item,
        key: item.id,
        type: 'item',
      })
      continue
    }

    if (isActivityTimelineItem(item)) {
      addActivityItem(item)
      continue
    }
  }

  return entries
}

function isVisibleMessageTimelineItem(
  item: AgentTimelineItem,
): item is Extract<AgentTimelineItem, { type: 'message' }> {
  return item.type === 'message' && !isActivityTimelineMessage(item)
}

function isActivityTimelineItem(item: AgentTimelineItem): item is ActivityTimelineItem {
  return (
    item.type === 'tool' ||
    item.type === 'lifecycle' ||
    isActivityTimelineMessage(item)
  )
}

function isActivityTimelineMessage(
  item: AgentTimelineItem,
): item is ActivityTimelineMessage {
  return item.type === 'message' && (item.blockKind === 'thinking' || item.role === 'tool')
}

function AgentTimelineEntry({
  entry,
  isLast,
}: {
  entry: TimelineEntry
  isLast: boolean
}) {
  const glyph = isLast ? '└' : '├'

  if (entry.type === 'activity') {
    return <ActivityTimelineGroup glyph={glyph} items={entry.items} />
  }

  return <AgentTimelineRow glyph={glyph} item={entry.item} />
}

function AgentTimelineRow({
  glyph,
  item,
}: {
  glyph: string
  item: AgentTimelineItem
}) {
  if (item.type === 'tool') {
    return <ToolTimelineRow glyph={glyph} item={item} />
  }

  if (item.type === 'lifecycle') {
    return <LifecycleTimelineRow glyph={glyph} item={item} />
  }

  return <MessageTimelineRow glyph={glyph} item={item} />
}

function ActivityTimelineGroup({
  glyph,
  items,
}: {
  glyph: string
  items: ActivityTimelineItem[]
}) {
  const status = getActivityStatus(items)

  return (
    <details className={`cbv-agent-terminal-row is-activity is-${status}`}>
      <summary>
        <span className="cbv-agent-terminal-glyph">{glyph}</span>
        <span className="cbv-agent-terminal-row-label">activity</span>
        <span className="cbv-agent-terminal-row-meta">· {formatActivitySummary(items)}</span>
      </summary>
      <div className="cbv-agent-terminal-activity-details">
        {items.map((item) => {
          if (item.type === 'tool') {
            return <ActivityToolDetail item={item} key={item.id} />
          }

          if (item.type === 'lifecycle') {
            return <ActivityLifecycleDetail item={item} key={item.id} />
          }

          return <ActivityMessageDetail item={item} key={item.id} />
        })}
      </div>
    </details>
  )
}

function ActivityToolDetail({
  item,
}: {
  item: Extract<AgentTimelineItem, { type: 'tool' }>
}) {
  const durationText = item.durationMs === undefined
    ? null
    : formatDuration(item.durationMs)
  const statusText = item.status === 'completed'
    ? 'ok'
    : item.status === 'error'
      ? 'error'
      : 'running'

  return (
    <div className={`cbv-agent-terminal-activity-item is-tool is-${item.status}`}>
      <div className="cbv-agent-terminal-row-line">
        <span className="cbv-agent-terminal-row-label">{formatToolTitle(item)}</span>
        {durationText ? <span className="cbv-agent-terminal-row-meta">· {durationText}</span> : null}
        <span className="cbv-agent-terminal-row-meta">· {statusText}</span>
      </div>
      <div className="cbv-agent-terminal-details">
        {item.paths?.length ? (
          <p>paths {item.paths.join(' · ')}</p>
        ) : null}
        {item.symbolNodeIds?.length ? (
          <p>symbols {formatSymbolRefs(item.symbolNodeIds)}</p>
        ) : null}
        <pre>args {formatJsonPreview(item.args)}</pre>
        {item.resultPreview ? (
          <pre>result {item.resultPreview}</pre>
        ) : null}
        {item.isError ? <p>error true</p> : null}
      </div>
    </div>
  )
}

function ActivityMessageDetail({
  item,
}: {
  item: ActivityTimelineMessage
}) {
  const isThinking = item.blockKind === 'thinking'

  return (
    <div className={`cbv-agent-terminal-activity-item is-${isThinking ? 'thinking' : 'tool-result'}`}>
      <div className="cbv-agent-terminal-row-line">
        <span className="cbv-agent-terminal-row-label">
          {isThinking ? 'thinking' : 'tool result'}
        </span>
        <span className="cbv-agent-terminal-row-meta">
          · {item.isStreaming ? 'streaming' : 'done'}
        </span>
      </div>
      <pre>{item.text || '...'}</pre>
    </div>
  )
}

function ActivityLifecycleDetail({
  item,
}: {
  item: Extract<AgentTimelineItem, { type: 'lifecycle' }>
}) {
  const detail = formatLifecycleDetail(item)

  return (
    <div className={`cbv-agent-terminal-activity-item is-lifecycle is-${item.status ?? 'idle'}`}>
      <div className="cbv-agent-terminal-row-line">
        <span className="cbv-agent-terminal-row-label">{item.label}</span>
        {detail ? (
          <span className="cbv-agent-terminal-row-meta">· {detail}</span>
        ) : null}
      </div>
      {item.detail ? (
        <p className="cbv-agent-terminal-detail-line">{item.detail}</p>
      ) : null}
    </div>
  )
}

function getActivityStatus(items: ActivityTimelineItem[]) {
  if (items.some((item) => item.type === 'tool' && item.status === 'error')) {
    return 'error'
  }

  if (items.some((item) => (
    item.type === 'tool'
      ? item.status === 'running'
      : item.type === 'lifecycle'
        ? item.status === 'running' || item.status === 'queued'
        : item.isStreaming
  ))) {
    return 'running'
  }

  return 'completed'
}

function formatActivitySummary(items: ActivityTimelineItem[]) {
  const toolCallCount = items.filter((item) => item.type === 'tool').length
  const toolResultCount = items.filter(
    (item) => item.type === 'message' && item.role === 'tool',
  ).length
  const thinkingCount = items.filter(
    (item) => item.type === 'message' && item.blockKind === 'thinking',
  ).length
  const lifecycleCount = items.filter((item) => item.type === 'lifecycle').length
  const status = getActivityStatus(items)
  const parts = [
    toolCallCount > 0
      ? `${toolCallCount} tool call${toolCallCount === 1 ? '' : 's'}`
      : '',
    toolResultCount > 0
      ? `${toolResultCount} tool result${toolResultCount === 1 ? '' : 's'}`
      : '',
    thinkingCount > 0 ? `${thinkingCount} thinking` : '',
    lifecycleCount > 0
      ? `${lifecycleCount} event${lifecycleCount === 1 ? '' : 's'}`
      : '',
    status !== 'completed' ? status : '',
  ].filter(Boolean)

  return parts.join(' · ')
}

function MessageTimelineRow({
  glyph,
  item,
}: {
  glyph: string
  item: Extract<AgentTimelineItem, { type: 'message' }>
}) {
  const rowLabel = item.blockKind === 'thinking' ? 'thinking' : item.role
  const statusText = item.isStreaming ? 'streaming' : 'done'

  if (item.blockKind === 'thinking') {
    return (
      <details
        className="cbv-agent-terminal-row is-thinking"
        open={item.isStreaming}
      >
        <summary>
          <span className="cbv-agent-terminal-glyph">{glyph}</span>
          <span>{rowLabel}</span>
          <span>· {statusText}</span>
        </summary>
        <pre>{item.text || '...'}</pre>
      </details>
    )
  }

  return (
    <article
      className={[
        'cbv-agent-terminal-row',
        'is-message',
        `is-${item.role}`,
        item.isStreaming ? 'is-streaming' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="cbv-agent-terminal-row-line">
        <span className="cbv-agent-terminal-glyph">{glyph}</span>
        <span className="cbv-agent-terminal-row-label">{rowLabel}</span>
        {item.isStreaming ? (
          <span className="cbv-agent-terminal-row-meta">· streaming</span>
        ) : null}
      </div>
      <div className="cbv-agent-terminal-message-body">
        {item.text || (item.role === 'assistant' ? '...' : ' ')}
      </div>
    </article>
  )
}

function ToolTimelineRow({
  glyph,
  item,
}: {
  glyph: string
  item: Extract<AgentTimelineItem, { type: 'tool' }>
}) {
  const toolTitle = formatToolTitle(item)
  const statusText = item.status === 'completed'
    ? 'ok'
    : item.status === 'error'
      ? 'error'
      : 'running'
  const durationText = item.durationMs === undefined
    ? null
    : formatDuration(item.durationMs)

  return (
    <details
      className={`cbv-agent-terminal-row is-tool is-${item.status}`}
    >
      <summary>
        <span className="cbv-agent-terminal-glyph">{glyph}</span>
        <span>{toolTitle}</span>
        {durationText ? <span>· {durationText}</span> : null}
        <span>· {statusText}</span>
      </summary>
      <div className="cbv-agent-terminal-details">
        {item.paths?.length ? (
          <p>paths {item.paths.join(' · ')}</p>
        ) : null}
        {item.symbolNodeIds?.length ? (
          <p>symbols {formatSymbolRefs(item.symbolNodeIds)}</p>
        ) : null}
        <pre>args {formatJsonPreview(item.args)}</pre>
        {item.resultPreview ? (
          <pre>result {item.resultPreview}</pre>
        ) : null}
        {item.isError ? <p>error true</p> : null}
      </div>
    </details>
  )
}

function LifecycleTimelineRow({
  glyph,
  item,
}: {
  glyph: string
  item: Extract<AgentTimelineItem, { type: 'lifecycle' }>
}) {
  const detail = formatLifecycleDetail(item)

  return (
    <div className={`cbv-agent-terminal-row is-lifecycle is-${item.status ?? 'idle'}`}>
      <div className="cbv-agent-terminal-row-line">
        <span className="cbv-agent-terminal-glyph">{glyph}</span>
        <span>{item.label}</span>
        {detail ? <span>· {detail}</span> : null}
      </div>
      {item.detail ? (
        <p className="cbv-agent-terminal-detail-line">{item.detail}</p>
      ) : null}
    </div>
  )
}

function formatToolTitle(item: Extract<AgentTimelineItem, { type: 'tool' }>) {
  const normalizedName = item.toolName.toLowerCase()
  const target = getToolTarget(item)

  if (normalizedName === 'bash' || normalizedName === 'shell') {
    return `shell ${target || item.toolName}`
  }

  if (normalizedName === 'edit') {
    return `edit ${target || item.toolName}`
  }

  return `tool ${item.toolName}${target ? ` ${target}` : ''}`
}

function getToolTarget(item: Extract<AgentTimelineItem, { type: 'tool' }>) {
  if (item.toolName === 'bash' || item.toolName === 'shell') {
    return getArgString(item.args, ['command', 'cmd'])
  }

  return (
    getArgString(item.args, ['path', 'file', 'filePath', 'filepath', 'query', 'pattern']) ||
    item.paths?.[0] ||
    ''
  )
}

function getArgString(args: unknown, keys: string[]) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return ''
  }

  const record = args as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'string' && value.trim()) {
      return compactLine(value.trim(), 96)
    }
  }

  return ''
}

function formatSymbolRefs(symbolNodeIds: string[]) {
  return symbolNodeIds
    .slice(0, 4)
    .map((symbolNodeId) => compactLine(symbolNodeId.replace(/^symbol:/, ''), 64))
    .join(' · ')
}

function formatLifecycleDetail(item: Extract<AgentTimelineItem, { type: 'lifecycle' }>) {
  const countText = item.counts
    ? Object.entries(item.counts)
        .map(([key, value]) => `${key}:${value}`)
        .join(' ')
    : ''
  const statusText = item.status && item.status !== 'completed' ? item.status : ''

  return [countText, statusText].filter(Boolean).join(' · ')
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
}

function formatJsonPreview(value: unknown) {
  const text = typeof value === 'string' ? value : safeJsonStringify(value)
  return compactLine(text, 1800)
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function compactLine(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized
}

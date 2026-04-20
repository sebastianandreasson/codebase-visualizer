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
  return (
    <div className="cbv-agent-terminal-timeline" onScroll={onScroll} ref={listRef}>
      {items.length > 0 ? (
        items.map((item, index) => (
          <AgentTimelineRow
            isLast={index === items.length - 1}
            item={item}
            key={item.id}
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

function AgentTimelineRow({
  isLast,
  item,
}: {
  isLast: boolean
  item: AgentTimelineItem
}) {
  if (item.type === 'tool') {
    return <ToolTimelineRow glyph={isLast ? '└' : '├'} item={item} />
  }

  if (item.type === 'lifecycle') {
    return <LifecycleTimelineRow glyph={isLast ? '└' : '├'} item={item} />
  }

  return <MessageTimelineRow glyph={isLast ? '└' : '├'} item={item} />
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
        <span>{rowLabel}</span>
        {item.isStreaming ? <span>· streaming</span> : null}
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
      open={item.status !== 'completed'}
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

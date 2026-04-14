import { memo } from 'react'

import { Handle, Position, type NodeProps } from '@xyflow/react'

type CodebaseSymbolNodeData = Record<string, unknown> & {
  title: string
  subtitle: string
  kind: string
  kindClass?: string
  tags: string[]
  dimmed: boolean
  clusterSize?: number
  sharedCallerCount?: number
  clusterExpanded?: boolean
  contained?: boolean
  compact?: boolean
}

export const CodebaseSymbolNode = memo(function CodebaseSymbolNode({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as CodebaseSymbolNodeData

  return (
    <div
      className={[
        'cbv-node',
        'is-symbol',
        nodeData.kindClass ? `is-kind-${nodeData.kindClass}` : '',
        nodeData.contained ? 'is-contained' : '',
        nodeData.clusterExpanded ? 'is-cluster-expanded' : '',
        nodeData.compact ? 'is-compact' : '',
        selected ? 'is-selected' : '',
        nodeData.dimmed ? 'is-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle
        className="cbv-node-handle"
        position={Position.Left}
        type="target"
      />
      <div className="cbv-node-meta">
        {nodeData.tags.map((tag) => (
          <span className="cbv-node-tag" key={tag}>
            {tag}
          </span>
        ))}
        {nodeData.sharedCallerCount && nodeData.sharedCallerCount > 1 ? (
          <span className="cbv-node-tag is-shared">
            {nodeData.sharedCallerCount} callers
          </span>
        ) : null}
        {nodeData.clusterSize && nodeData.clusterSize > 0 ? (
          <span className="cbv-node-tag is-cluster">
            {nodeData.clusterSize} internal {nodeData.clusterExpanded ? 'open' : 'hidden'}
          </span>
        ) : null}
      </div>
      <strong className="cbv-node-title">{nodeData.title}</strong>
      <span className="cbv-node-subtitle">{nodeData.subtitle}</span>
      <Handle
        className="cbv-node-handle"
        position={Position.Right}
        type="source"
      />
    </div>
  )
})

import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

type CodebaseAnnotationNodeData = Record<string, unknown> & {
  label: string
  dimmed: boolean
}

export const CodebaseAnnotationNode = memo(function CodebaseAnnotationNode({
  data,
}: NodeProps) {
  const annotation = data as CodebaseAnnotationNodeData

  return (
    <div
      className={[
        'cbv-annotation-node',
        annotation.dimmed ? 'is-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{annotation.label}</span>
    </div>
  )
})

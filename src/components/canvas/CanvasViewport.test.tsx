import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CanvasViewport } from './CanvasViewport'

const reactFlowMock = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
}))

vi.mock('@xyflow/react', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  const createElement = react.createElement

  return {
    Background: () => createElement('div', { 'data-testid': 'background' }),
    BackgroundVariant: { Dots: 'dots' },
    Controls: () => createElement('div', { 'data-testid': 'controls' }),
    MiniMap: () => createElement('div', { 'data-testid': 'minimap' }),
    ReactFlow: (props: { children?: ReactNode } & Record<string, unknown>) => {
      reactFlowMock.props.push(props)

      return createElement('div', { 'data-testid': 'react-flow' }, props.children)
    },
    useEdgesState: () => [[], () => undefined, () => undefined],
    useNodesState: () => [[], () => undefined, () => undefined],
  }
})

describe('CanvasViewport', () => {
  beforeEach(() => {
    reactFlowMock.props.length = 0
  })

  it('does not let React Flow raise selected folder containers above their contents', () => {
    render(
      <CanvasViewport
        agentHeatDebugOpen={false}
        agentHeatDebugState={{
          cameraLockActive: false,
          cameraLockUntilMs: 0,
          currentMode: 'idle',
          currentTarget: null,
          latestEvent: null,
          queueLength: 0,
          refreshInFlight: false,
          refreshPending: false,
        }}
        agentHeatFollowEnabled={false}
        agentHeatFollowText=""
        agentHeatHelperText=""
        agentHeatMode="files"
        agentHeatSource="all"
        agentHeatWindow={60}
        compareOverlayActive={false}
        compareSourceTitle={null}
        denseCanvasMode
        edges={[]}
        graphLayers={{ calls: false, contains: false, imports: false }}
        nodes={[]}
        onActivateCompareOverlay={() => undefined}
        onAgentHeatModeChange={() => undefined}
        onAgentHeatSourceChange={() => undefined}
        onAgentHeatWindowChange={() => undefined}
        onClearCompareOverlay={() => undefined}
        onEdgeClick={() => undefined}
        onEdgesChange={() => undefined}
        onInit={() => undefined}
        onMoveEnd={() => undefined}
        onNodeClick={() => undefined}
        onNodeDoubleClick={() => undefined}
        onNodeDrag={() => undefined}
        onNodeDragStop={() => undefined}
        onNodesChange={() => undefined}
        onOpenAgentEventFeed={() => undefined}
        onSemanticSearchChange={() => undefined}
        onSemanticSearchClear={() => undefined}
        onSemanticSearchLimitChange={() => undefined}
        onSemanticSearchModeChange={() => undefined}
        onSemanticSearchStrictnessChange={() => undefined}
        onToggleAgentHeatDebug={() => undefined}
        onToggleAgentHeatFollow={() => undefined}
        onToggleLayer={() => undefined}
        semanticSearchAvailable={false}
        semanticSearchGroupSearchAvailable={false}
        semanticSearchHelperText=""
        semanticSearchLimit={10}
        semanticSearchMode="symbols"
        semanticSearchPending={false}
        semanticSearchQuery=""
        semanticSearchResultCount={0}
        semanticSearchStrictness={50}
        showCompareAction={false}
        showSemanticSearch={false}
        themeMode="dark"
        utilitySummaryText=""
        viewMode="symbols"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        visibleLayerToggles={[]}
      />,
    )

    expect(reactFlowMock.props[0]?.elevateNodesOnSelect).toBe(false)
  })
})

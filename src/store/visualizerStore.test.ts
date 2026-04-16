import { describe, expect, it } from 'vitest'

import { createVisualizerStore } from './visualizerStore'

describe('visualizerStore compare overlay state', () => {
  it('tracks transient base scene and compare overlay state', () => {
    const store = createVisualizerStore()

    store.getState().setBaseScene({ kind: 'semantic_projection' })
    store.getState().setCompareOverlay({
      kind: 'layout_compare',
      sourceType: 'draft',
      sourceId: 'draft:feature',
    })
    store.getState().setOverlayVisibility(false)

    expect(store.getState().baseScene).toEqual({ kind: 'semantic_projection' })
    expect(store.getState().compareOverlay).toEqual({
      kind: 'layout_compare',
      sourceType: 'draft',
      sourceId: 'draft:feature',
    })
    expect(store.getState().overlayVisibility).toBe(false)
  })

  it('clears compare overlay without mutating layouts', () => {
    const store = createVisualizerStore()
    const layouts = [
      {
        id: 'layout:semantic:/tmp/repo',
        title: 'Semantic symbols',
        strategy: 'semantic' as const,
        nodeScope: 'symbols' as const,
        placements: {},
        groups: [],
        lanes: [],
        annotations: [],
        hiddenNodeIds: [],
      },
    ]

    store.getState().setLayouts(layouts)
    store.getState().setCompareOverlay({
      kind: 'layout_compare',
      sourceType: 'layout',
      sourceId: 'layout:feature',
    })
    store.getState().setOverlayVisibility(false)
    store.getState().clearCompareOverlay()

    expect(store.getState().compareOverlay).toBeNull()
    expect(store.getState().overlayVisibility).toBe(true)
    expect(store.getState().layouts).toEqual(layouts)
  })
})

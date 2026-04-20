import { describe, expect, it } from 'vitest'

import { createVisualizerStore } from './visualizerStore'
import type { LayoutDraft, LayoutSpec } from '../types'

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
    const layouts = [createLayout('layout:semantic:/tmp/repo', 'Semantic symbols', 'semantic')]

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

  it('does not auto-activate drafts when refreshing the draft list', () => {
    const store = createVisualizerStore()
    const draft = createDraft('draft:feature')

    store.getState().setActiveLayoutId('layout:semantic:/tmp/repo')
    store.getState().setDraftLayouts([draft])

    expect(store.getState().activeDraftId).toBeNull()
    expect(store.getState().activeLayoutId).toBe('layout:semantic:/tmp/repo')
  })

  it('does not switch the active layout when a refresh omits generated defaults', () => {
    const store = createVisualizerStore()
    const semanticLayout = createLayout('layout:semantic:/tmp/repo', 'Semantic symbols', 'semantic')
    const customLayout = createLayout('layout:custom', 'Custom layout', 'agent')

    store.getState().setLayouts([semanticLayout, customLayout])
    store.getState().setActiveLayoutId(semanticLayout.id)
    store.getState().setLayouts([customLayout])

    expect(store.getState().activeLayoutId).toBe(semanticLayout.id)
    expect(store.getState().layouts).toEqual([customLayout])
  })

  it('preserves the active draft when it still exists after a refresh', () => {
    const store = createVisualizerStore()
    const draft = createDraft('draft:feature')

    store.getState().setDraftLayouts([draft])
    store.getState().setActiveDraftId(draft.id)
    store.getState().setDraftLayouts([{ ...draft, updatedAt: '2026-04-19T10:00:00.000Z' }])

    expect(store.getState().activeDraftId).toBe(draft.id)
  })
})

function createLayout(
  id: string,
  title: string,
  strategy: LayoutSpec['strategy'] = 'agent',
): LayoutSpec {
  return {
    annotations: [],
    groups: [],
    hiddenNodeIds: [],
    id,
    lanes: [],
    nodeScope: 'symbols',
    placements: {},
    strategy,
    title,
  }
}

function createDraft(id: string): LayoutDraft {
  return {
    createdAt: '2026-04-18T10:00:00.000Z',
    id,
    layout: createLayout('layout:feature', 'Feature layout'),
    prompt: 'Feature layout',
    proposalEnvelope: {
      ambiguities: [],
      confidence: 1,
      proposal: {
        annotations: [],
        description: 'Feature layout',
        groups: [],
        hiddenNodeIds: [],
        lanes: [],
        placements: [],
        strategy: 'agent',
        title: 'Feature layout',
      },
      rationale: 'Feature layout',
      warnings: [],
    },
    source: 'agent',
    status: 'draft',
    updatedAt: '2026-04-18T10:00:00.000Z',
    validation: {
      issues: [],
      valid: true,
    },
  }
}

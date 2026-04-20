import { describe, expect, it } from 'vitest'

import type { LayoutSpec } from '../types'
import {
  createFollowVisibleLayout,
  getHiddenFollowSymbolIds,
} from './useCanvasGraphController'

describe('follow canvas layout helpers', () => {
  it('reveals follow targets through a transient layout without mutating the source layout', () => {
    const layout = createLayout()
    const revealedLayout = createFollowVisibleLayout(layout, ['symbol:target'])

    expect(revealedLayout).not.toBe(layout)
    expect(revealedLayout?.hiddenNodeIds).toEqual(['symbol:other', 'symbol:missing-placement'])
    expect(revealedLayout?.updatedAt).toBe(layout.updatedAt)
    expect(layout.hiddenNodeIds).toEqual([
      'symbol:target',
      'symbol:other',
      'symbol:missing-placement',
    ])
  })

  it('reports only hidden follow symbols with placements', () => {
    const layout = createLayout()

    expect(
      getHiddenFollowSymbolIds(layout, [
        'symbol:target',
        'symbol:visible',
        'symbol:missing-placement',
      ]),
    ).toEqual(['symbol:target'])
  })
})

function createLayout(): LayoutSpec {
  return {
    annotations: [],
    createdAt: '2026-04-18T10:00:00.000Z',
    description: 'Test semantic layout.',
    groups: [],
    hiddenNodeIds: ['symbol:target', 'symbol:other', 'symbol:missing-placement'],
    id: 'layout:semantic:/workspace',
    lanes: [],
    nodeScope: 'symbols',
    placements: {
      'symbol:target': {
        height: 82,
        nodeId: 'symbol:target',
        width: 248,
        x: 0,
        y: 0,
      },
      'symbol:visible': {
        height: 82,
        nodeId: 'symbol:visible',
        width: 248,
        x: 320,
        y: 0,
      },
      'symbol:other': {
        height: 82,
        nodeId: 'symbol:other',
        width: 248,
        x: 640,
        y: 0,
      },
    },
    strategy: 'semantic',
    title: 'Semantic symbols',
    updatedAt: '2026-04-18T10:00:00.000Z',
  }
}

import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type {
  CodebaseSnapshot,
  LayoutSpec,
  SymbolKind,
  SymbolNode,
} from '../types'
import {
  applyFlowEdgePresentation,
  applyFlowNodePresentation,
  buildUpdatedPlacementsForMovedNode,
  buildWorkspaceSidebarGroups,
} from './flowModel'

describe('flowModel extracted helpers', () => {
  it('groups the workspace outline by semantic facets before core symbol kinds', () => {
    const snapshot = buildSnapshot([
      symbol('component', 'Dashboard', 'react:component', 'function', 1, 40),
      symbol('hook', 'useTodos', 'react:hook', 'function', 1, 12),
      symbol('class', 'TodoStore', null, 'class', 1, 18),
      symbol('smallComponent', 'Badge', 'react:component', 'function', 1, 8),
    ])
    const layout = buildSymbolLayout(['component', 'hook', 'class', 'smallComponent'])

    const groups = buildWorkspaceSidebarGroups({ layout, snapshot })

    expect(groups.map((group) => group.id)).toEqual([
      'react:component',
      'react:hook',
      'symbol:class',
    ])
    expect(groups[0]?.items.map((item) => item.title)).toEqual(['Dashboard', 'Badge'])
    expect(groups[0]?.items.map((item) => item.metric)).toEqual([40, 8])
    expect(groups[0]?.items[0]?.badge).toBe('react')
  })

  it('applies selected, compare, heat, and dimming presentation to flow nodes', () => {
    const nodes: Node[] = [
      { id: 'hot', position: { x: 0, y: 0 }, data: {} },
      { id: 'selected', position: { x: 0, y: 0 }, data: {} },
      { id: 'cold', position: { x: 0, y: 0 }, data: {} },
    ]

    const presented = applyFlowNodePresentation(
      nodes,
      new Set(['selected']),
      {
        active: true,
        nodeIds: new Set(['hot']),
      },
      new Map([['hot', { pulse: true, weight: 0.75 }]]),
    )

    expect(presented[0]?.data).toMatchObject({
      dimmed: false,
      heatPulse: true,
      heatWeight: 0.75,
      highlighted: true,
    })
    expect(presented[1]?.selected).toBe(true)
    expect(presented[1]?.data).toMatchObject({ dimmed: true, highlighted: false })
    expect(presented[2]?.data).toMatchObject({ dimmed: true, highlighted: false })
  })

  it('dims non-highlighted edges and promotes highlighted compare edges', () => {
    const edges: Edge[] = [
      {
        id: 'selected-edge',
        source: 'a',
        target: 'b',
        data: { kind: 'calls' },
      },
      {
        id: 'dimmed-edge',
        source: 'a',
        target: 'c',
        data: { kind: 'imports' },
      },
    ]

    const presented = applyFlowEdgePresentation(edges, {
      active: true,
      nodeIds: new Set(['a', 'b']),
    })

    expect(presented[0]?.data).toMatchObject({ highlighted: true, dimmed: false })
    expect(presented[0]?.style).toMatchObject({ opacity: 1, strokeWidth: 2.4 })
    expect(presented[1]?.data).toMatchObject({ highlighted: false, dimmed: true })
    expect(presented[1]?.style).toMatchObject({ opacity: 0.2 })
  })

  it('moves filesystem directory descendants with the dragged directory', () => {
    const snapshot = buildFilesystemSnapshot()
    const layout: LayoutSpec = {
      id: 'filesystem',
      title: 'Filesystem',
      strategy: 'structural',
      nodeScope: 'filesystem',
      placements: {
        dir: { nodeId: 'dir', x: 0, y: 0 },
        file: { nodeId: 'file', x: 20, y: 30 },
      },
      groups: [],
      lanes: [],
      annotations: [],
      hiddenNodeIds: [],
    }

    const placements = buildUpdatedPlacementsForMovedNode(
      layout,
      snapshot,
      'filesystem',
      'dir',
      { x: 10, y: 15 },
    )

    expect(placements.dir).toMatchObject({ x: 10, y: 15 })
    expect(placements.file).toMatchObject({ x: 30, y: 45 })
  })
})

function symbol(
  id: string,
  name: string,
  facet: string | null,
  symbolKind: SymbolKind,
  startLine: number,
  endLine: number,
): SymbolNode {
  return {
    facets: facet ? [facet] : [],
    fileId: 'file',
    id,
    kind: 'symbol',
    name,
    parentSymbolId: null,
    path: `src/app.ts#${name}`,
    range: {
      end: { column: 1, line: endLine },
      start: { column: 1, line: startLine },
    },
    symbolKind,
    tags: [],
  }
}

function buildSnapshot(symbols: SymbolNode[]): CodebaseSnapshot {
  return {
    detectedPlugins: [],
    edges: [],
    entryFileIds: ['file'],
    facetDefinitions: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes: {
      file: {
        content: null,
        extension: '.ts',
        facets: [],
        id: 'file',
        kind: 'file',
        name: 'app.ts',
        parentId: null,
        path: 'src/app.ts',
        size: 100,
        tags: [],
      },
      ...Object.fromEntries(symbols.map((node) => [node.id, node])),
    },
    rootDir: '/repo',
    rootIds: ['file'],
    schemaVersion: 2,
    tags: [],
    totalFiles: 1,
  }
}

function buildSymbolLayout(nodeIds: string[]): LayoutSpec {
  return {
    annotations: [],
    groups: [],
    hiddenNodeIds: [],
    id: 'symbols',
    lanes: [],
    nodeScope: 'symbols',
    placements: Object.fromEntries(
      nodeIds.map((nodeId, index) => [
        nodeId,
        { nodeId, x: index * 100, y: 0 },
      ]),
    ),
    strategy: 'structural',
    title: 'Symbols',
  }
}

function buildFilesystemSnapshot(): CodebaseSnapshot {
  return {
    detectedPlugins: [],
    edges: [],
    entryFileIds: ['file'],
    facetDefinitions: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes: {
      dir: {
        childIds: ['file'],
        depth: 0,
        facets: [],
        id: 'dir',
        kind: 'directory',
        name: 'src',
        parentId: null,
        path: 'src',
        tags: [],
      },
      file: {
        content: null,
        extension: '.ts',
        facets: [],
        id: 'file',
        kind: 'file',
        name: 'app.ts',
        parentId: 'dir',
        path: 'src/app.ts',
        size: 100,
        tags: [],
      },
    },
    rootDir: '/repo',
    rootIds: ['dir'],
    schemaVersion: 2,
    tags: [],
    totalFiles: 1,
  }
}

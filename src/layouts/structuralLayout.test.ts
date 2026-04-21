import { describe, expect, it } from 'vitest'

import { buildStructuralLayout } from './structuralLayout'
import type { ApiEndpointNode, ProjectSnapshot } from '../types'

describe('buildStructuralLayout', () => {
  it('places API endpoint nodes in the filesystem layout', () => {
    const snapshot = buildSnapshot([
      endpoint('api:endpoint:GET:/health', 'GET /health', 'GET', '/health'),
    ])

    const layout = buildStructuralLayout(snapshot)
    const endpointPlacement = layout.placements['api:endpoint:GET:/health']
    const filePlacement = layout.placements['src/server.ts']

    expect(endpointPlacement).toBeDefined()
    expect(filePlacement).toBeDefined()
    expect(endpointPlacement?.x).toBeGreaterThan(filePlacement?.x ?? 0)
    expect(endpointPlacement).toMatchObject({
      height: 96,
      width: 268,
    })
  })
})

function endpoint(
  id: string,
  name: string,
  method: string,
  routePattern: string,
): ApiEndpointNode {
  return {
    confidence: 0.88,
    facets: ['api:endpoint', 'api:server-only'],
    framework: 'express',
    id,
    kind: 'api_endpoint',
    method,
    name,
    normalizedRoutePattern: routePattern,
    parentId: null,
    path: `api://api${routePattern}`,
    protocol: 'http',
    routePattern,
    scopeId: 'api',
    source: 'server',
    tags: ['api_endpoint'],
  }
}

function buildSnapshot(endpoints: ApiEndpointNode[]): ProjectSnapshot {
  return {
    detectedPlugins: [],
    edges: [],
    entryFileIds: ['src/server.ts'],
    facetDefinitions: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes: {
      src: {
        childIds: ['src/server.ts'],
        depth: 0,
        facets: [],
        id: 'src',
        kind: 'directory',
        name: 'src',
        parentId: null,
        path: 'src',
        tags: [],
      },
      'src/server.ts': {
        content: null,
        extension: '.ts',
        facets: [],
        id: 'src/server.ts',
        kind: 'file',
        name: 'server.ts',
        parentId: 'src',
        path: 'src/server.ts',
        size: 100,
        tags: [],
      },
      ...Object.fromEntries(endpoints.map((node) => [node.id, node])),
    },
    rootDir: '/repo',
    rootIds: ['src'],
    schemaVersion: 3,
    tags: [],
    totalFiles: 1,
  }
}

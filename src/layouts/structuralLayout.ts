import type {
  ApiEndpointNode,
  LayoutNodePlacement,
  LayoutSpec,
  ProjectSnapshot,
} from '../types'
import { isApiEndpointNode } from '../schema/snapshot'

const DIRECTORY_NODE_WIDTH = 240
const FILE_NODE_WIDTH = 224
const DIRECTORY_NODE_HEIGHT = 68
const FILE_NODE_HEIGHT = 54
const API_ENDPOINT_NODE_WIDTH = 268
const API_ENDPOINT_NODE_HEIGHT = 96
const API_ENDPOINT_ROW_HEIGHT = 124
const COLUMN_WIDTH = 280
const ROW_HEIGHT = 94
const API_COLUMN_GAP = 120

export function buildStructuralLayout(snapshot: ProjectSnapshot): LayoutSpec {
  const placements: Record<string, LayoutNodePlacement> = {}
  let rowIndex = 0

  for (const rootId of snapshot.rootIds) {
    rowIndex = placeNode(snapshot, rootId, placements, 0, rowIndex)
    rowIndex += 1
  }

  placeApiEndpoints(snapshot, placements)

  return {
    id: `layout:structural:${snapshot.rootDir}`,
    title: 'Folder structure',
    strategy: 'structural',
    nodeScope: 'filesystem',
    description: 'Default filesystem layout mapped directly from the project tree.',
    placements,
    groups: [],
    lanes: [],
    annotations: [],
    hiddenNodeIds: Object.values(snapshot.nodes)
      .filter((node) => node.kind === 'symbol')
      .map((node) => node.id),
    createdAt: snapshot.generatedAt,
    updatedAt: snapshot.generatedAt,
  }
}

function placeApiEndpoints(
  snapshot: ProjectSnapshot,
  placements: Record<string, LayoutNodePlacement>,
) {
  const endpoints = Object.values(snapshot.nodes)
    .filter(isApiEndpointNode)
    .sort(compareApiEndpoints)

  if (endpoints.length === 0) {
    return
  }

  const maxFilesystemDepth = Math.max(
    0,
    ...Object.values(placements).map((placement) =>
      Math.round(placement.x / COLUMN_WIDTH),
    ),
  )
  const x = (maxFilesystemDepth + 1) * COLUMN_WIDTH + API_COLUMN_GAP

  endpoints.forEach((endpoint, index) => {
    placements[endpoint.id] = {
      nodeId: endpoint.id,
      x,
      y: index * API_ENDPOINT_ROW_HEIGHT,
      width: API_ENDPOINT_NODE_WIDTH,
      height: API_ENDPOINT_NODE_HEIGHT,
    }
  })
}

function placeNode(
  snapshot: ProjectSnapshot,
  nodeId: string,
  placements: Record<string, LayoutNodePlacement>,
  depth: number,
  rowIndex: number,
): number {
  const node = snapshot.nodes[nodeId]

  if (!node || node.kind === 'symbol') {
    return rowIndex
  }

  placements[node.id] = {
    nodeId: node.id,
    x: depth * COLUMN_WIDTH,
    y: rowIndex * ROW_HEIGHT,
    width:
      node.kind === 'directory' ? DIRECTORY_NODE_WIDTH : FILE_NODE_WIDTH,
    height:
      node.kind === 'directory' ? DIRECTORY_NODE_HEIGHT : FILE_NODE_HEIGHT,
  }

  let nextRowIndex = rowIndex + 1

  if (node.kind !== 'directory') {
    return nextRowIndex
  }

  for (const childId of node.childIds) {
    nextRowIndex = placeNode(
      snapshot,
      childId,
      placements,
      depth + 1,
      nextRowIndex,
    )
  }

  return nextRowIndex
}

function compareApiEndpoints(left: ApiEndpointNode, right: ApiEndpointNode) {
  const leftScope = left.serviceName ?? left.scopeId
  const rightScope = right.serviceName ?? right.scopeId

  if (leftScope !== rightScope) {
    return leftScope.localeCompare(rightScope)
  }

  if (left.normalizedRoutePattern !== right.normalizedRoutePattern) {
    return left.normalizedRoutePattern.localeCompare(right.normalizedRoutePattern)
  }

  return left.method.localeCompare(right.method)
}

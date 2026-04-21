import type {
  ApiEndpointNode,
  GraphEdge,
  LayoutNodePlacement,
  LayoutSpec,
  ProjectSnapshot,
  SymbolKind,
  SymbolNode,
} from '../types'
import { isApiEndpointNode } from '../schema/snapshot'

const SYMBOL_NODE_WIDTH = 248
const SYMBOL_NODE_HEIGHT = 82
const API_ENDPOINT_NODE_WIDTH = 268
const API_ENDPOINT_NODE_HEIGHT = 96
const COMPONENT_GAP_X = 220
const COMPONENT_GAP_Y = 82
const ISOLATED_GAP_X = 130
const ISOLATED_GAP_Y = 96
const ISOLATED_SHELF_WIDTH = 4_400
const MIN_SYMBOL_SLOT_WIDTH = 340
const MAX_SYMBOL_SLOT_WIDTH = 1_560
const MIN_SYMBOL_SLOT_HEIGHT = 150
const MAX_SYMBOL_SLOT_HEIGHT = 860
const SYMBOL_LAYOUT_COORDINATE_VERSION = 'symbol-spacing-v2'

const SUPPORTED_SYMBOL_KINDS = new Set<SymbolKind>([
  'class',
  'function',
  'method',
  'constant',
  'variable',
])

const SYMBOL_KIND_ORDER: Record<SymbolKind, number> = {
  class: 0,
  function: 1,
  method: 2,
  constant: 3,
  variable: 4,
  module: 5,
  unknown: 6,
}

export function buildSymbolLayout(snapshot: ProjectSnapshot): LayoutSpec {
  const placements: Record<string, LayoutNodePlacement> = {}
  const symbols = Object.values(snapshot.nodes).filter(isSupportedSymbolNode)
  const endpoints = Object.values(snapshot.nodes).filter(isApiEndpointNode)
  const layoutNodes: SymbolLayoutNode[] = [...symbols, ...endpoints]
  const adjacency = buildSymbolAdjacency(layoutNodes, snapshot.edges)
  const components = collectComponents(layoutNodes, adjacency)
  const connectedComponents = components.filter((component) => component.length > 1)
  const isolatedSymbols = components
    .filter((component) => component.length === 1)
    .flat()
    .sort(compareSymbols)

  let componentCursorX = 0

  connectedComponents
    .sort((left, right) => compareComponents(left, right, adjacency))
    .forEach((component) => {
      const sortedComponent = [...component].sort((left, right) =>
        compareSymbolsByDegree(left, right, adjacency),
      )
      const componentSlots = sortedComponent.map(getSymbolLayoutSlot)
      const componentWidth = Math.max(
        ...componentSlots.map((slot) => slot.width),
        MIN_SYMBOL_SLOT_WIDTH,
      )
      let componentCursorY = 0

      sortedComponent.forEach((symbol, rowIndex) => {
        const slot = componentSlots[rowIndex] ?? getSymbolLayoutSlot(symbol)
        placements[symbol.id] = {
          nodeId: symbol.id,
          x: componentCursorX,
          y: componentCursorY,
          width: getLayoutNodeWidth(symbol),
          height: getLayoutNodeHeight(symbol),
        }

        componentCursorY += slot.height + COMPONENT_GAP_Y
      })

      componentCursorX += componentWidth + COMPONENT_GAP_X
    })

  const isolatedBaseX = componentCursorX
  const isolatedMaxX = isolatedBaseX + ISOLATED_SHELF_WIDTH
  let isolatedCursorX = isolatedBaseX
  let isolatedCursorY = 0
  let isolatedRowHeight = 0

  isolatedSymbols.forEach((symbol) => {
    const slot = getSymbolLayoutSlot(symbol)

    if (
      isolatedCursorX > isolatedBaseX &&
      isolatedCursorX + slot.width > isolatedMaxX
    ) {
      isolatedCursorX = isolatedBaseX
      isolatedCursorY += isolatedRowHeight + ISOLATED_GAP_Y
      isolatedRowHeight = 0
    }

    placements[symbol.id] = {
      nodeId: symbol.id,
      x: isolatedCursorX,
      y: isolatedCursorY,
      width: getLayoutNodeWidth(symbol),
      height: getLayoutNodeHeight(symbol),
    }

    isolatedCursorX += slot.width + ISOLATED_GAP_X
    isolatedRowHeight = Math.max(isolatedRowHeight, slot.height)
  })

  return {
    id: `layout:symbols:${snapshot.rootDir}`,
    title: 'Code symbols',
    strategy: 'structural',
    nodeScope: 'symbols',
    description: `Default symbol-only layout grouped by connected symbol components. ${SYMBOL_LAYOUT_COORDINATE_VERSION}`,
    placements,
    groups: [],
    lanes: [],
    annotations: [],
    hiddenNodeIds: Object.values(snapshot.nodes)
      .filter((node) => !isSupportedSymbolNode(node) && !isApiEndpointNode(node))
      .map((node) => node.id),
    createdAt: snapshot.generatedAt,
    updatedAt: snapshot.generatedAt,
  }
}

export type SymbolLayoutNode = SymbolNode | ApiEndpointNode

export function getSymbolLayoutSlot(symbol: SymbolLayoutNode) {
  const loc = getSymbolLoc(symbol)
  const logLoc = Math.log10(loc + 1)
  const highLocWeight = Math.max(0, Math.min(1, (logLoc - 2.1) / 0.9))
  const locScale = Math.max(
    1,
    Math.min(
      5.4,
      1 +
        Math.pow(logLoc, 1.45) * 0.58 +
        Math.pow(highLocWeight, 1.35) * 1.55,
    ),
  )

  return {
    width: Math.round(
      Math.max(
        MIN_SYMBOL_SLOT_WIDTH,
        Math.min(MAX_SYMBOL_SLOT_WIDTH, getLayoutNodeWidth(symbol) * locScale + 96),
      ),
    ),
    height: Math.round(
      Math.max(
        MIN_SYMBOL_SLOT_HEIGHT,
        Math.min(MAX_SYMBOL_SLOT_HEIGHT, getLayoutNodeHeight(symbol) * locScale + 170),
      ),
    ),
  }
}

function getSymbolLoc(symbol: SymbolLayoutNode) {
  if (isApiEndpointNode(symbol)) {
    return 1
  }

  if (!symbol.range) {
    return 1
  }

  return Math.max(1, symbol.range.end.line - symbol.range.start.line + 1)
}

function buildSymbolAdjacency(
  symbols: SymbolLayoutNode[],
  edges: GraphEdge[],
) {
  const symbolIds = new Set(symbols.map((symbol) => symbol.id))
  const adjacency = new Map<string, Set<string>>()

  for (const symbol of symbols) {
    adjacency.set(symbol.id, new Set())
  }

  for (const edge of edges) {
    if (
      edge.kind !== 'calls' &&
      edge.kind !== 'contains' &&
      edge.kind !== 'api_calls' &&
      edge.kind !== 'handles'
    ) {
      continue
    }

    if (!symbolIds.has(edge.source) || !symbolIds.has(edge.target)) {
      continue
    }

    adjacency.get(edge.source)?.add(edge.target)
    adjacency.get(edge.target)?.add(edge.source)
  }

  return adjacency
}

function collectComponents(
  symbols: SymbolLayoutNode[],
  adjacency: Map<string, Set<string>>,
) {
  const remaining = new Set(symbols.map((symbol) => symbol.id))
  const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]))
  const components: SymbolLayoutNode[][] = []

  while (remaining.size > 0) {
    const startId = Array.from(remaining).sort()[0]

    if (!startId) {
      break
    }

    const component: SymbolLayoutNode[] = []
    const stack = [startId]
    remaining.delete(startId)

    while (stack.length > 0) {
      const currentId = stack.pop()

      if (!currentId) {
        continue
      }

      const currentSymbol = symbolById.get(currentId)

      if (currentSymbol) {
        component.push(currentSymbol)
      }

      const neighbors = Array.from(adjacency.get(currentId) ?? []).sort()

      for (const neighborId of neighbors) {
        if (!remaining.has(neighborId)) {
          continue
        }

        remaining.delete(neighborId)
        stack.push(neighborId)
      }
    }

    components.push(component.sort(compareSymbols))
  }

  return components
}

function compareComponents(
  left: SymbolLayoutNode[],
  right: SymbolLayoutNode[],
  adjacency: Map<string, Set<string>>,
) {
  if (left.length !== right.length) {
    return right.length - left.length
  }

  const leftDegree = sumComponentDegree(left, adjacency)
  const rightDegree = sumComponentDegree(right, adjacency)

  if (leftDegree !== rightDegree) {
    return rightDegree - leftDegree
  }

  return compareSymbols(left[0], right[0])
}

function sumComponentDegree(
  component: SymbolLayoutNode[],
  adjacency: Map<string, Set<string>>,
) {
  return component.reduce(
    (sum, symbol) => sum + (adjacency.get(symbol.id)?.size ?? 0),
    0,
  )
}

function compareSymbolsByDegree(
  left: SymbolLayoutNode,
  right: SymbolLayoutNode,
  adjacency: Map<string, Set<string>>,
) {
  const leftDegree = adjacency.get(left.id)?.size ?? 0
  const rightDegree = adjacency.get(right.id)?.size ?? 0

  if (leftDegree !== rightDegree) {
    return rightDegree - leftDegree
  }

  return compareSymbols(left, right)
}

function compareSymbols(left: SymbolLayoutNode, right: SymbolLayoutNode) {
  const leftKindOrder = getLayoutNodeKindOrder(left)
  const rightKindOrder = getLayoutNodeKindOrder(right)

  if (leftKindOrder !== rightKindOrder) {
    return leftKindOrder - rightKindOrder
  }

  if (left.path !== right.path) {
    return left.path.localeCompare(right.path)
  }

  const leftLine = isApiEndpointNode(left)
    ? Number.MAX_SAFE_INTEGER
    : left.range?.start.line ?? Number.MAX_SAFE_INTEGER
  const rightLine = isApiEndpointNode(right)
    ? Number.MAX_SAFE_INTEGER
    : right.range?.start.line ?? Number.MAX_SAFE_INTEGER

  if (leftLine !== rightLine) {
    return leftLine - rightLine
  }

  const leftColumn = isApiEndpointNode(left)
    ? Number.MAX_SAFE_INTEGER
    : left.range?.start.column ?? Number.MAX_SAFE_INTEGER
  const rightColumn = isApiEndpointNode(right)
    ? Number.MAX_SAFE_INTEGER
    : right.range?.start.column ?? Number.MAX_SAFE_INTEGER

  if (leftColumn !== rightColumn) {
    return leftColumn - rightColumn
  }

  return left.id.localeCompare(right.id)
}

function getLayoutNodeWidth(node: SymbolLayoutNode) {
  return isApiEndpointNode(node) ? API_ENDPOINT_NODE_WIDTH : SYMBOL_NODE_WIDTH
}

function getLayoutNodeHeight(node: SymbolLayoutNode) {
  return isApiEndpointNode(node) ? API_ENDPOINT_NODE_HEIGHT : SYMBOL_NODE_HEIGHT
}

function getLayoutNodeKindOrder(node: SymbolLayoutNode) {
  if (isApiEndpointNode(node)) {
    return 2.5
  }

  return SYMBOL_KIND_ORDER[node.symbolKind] ?? Number.MAX_SAFE_INTEGER
}

function isSupportedSymbolNode(
  node: ProjectSnapshot['nodes'][string],
): node is SymbolNode {
  return node.kind === 'symbol' && SUPPORTED_SYMBOL_KINDS.has(node.symbolKind)
}

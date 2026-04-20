import type { AgentToolInvocation } from '../../schema/agent'

const MAX_CODE_REFERENCE_COUNT = 32
const SYMBOL_NODE_ID_PREFIX = 'symbol:'

export interface AgentCodeReferences {
  nodeIds?: string[]
  symbolNodeIds?: string[]
}

export function deriveToolCodeReferences(
  toolName: string,
  args: unknown,
  result?: unknown,
): AgentCodeReferences {
  const nodeIds = new Set<string>()
  const symbolNodeIds = new Set<string>()

  collectCodeReferences(toolName, nodeIds, symbolNodeIds)
  collectCodeReferences(args, nodeIds, symbolNodeIds)
  collectCodeReferences(result, nodeIds, symbolNodeIds)

  return normalizeCodeReferences({
    nodeIds: [...nodeIds],
    symbolNodeIds: [...symbolNodeIds],
  })
}

export function mergeToolCodeReferences(
  invocation: AgentToolInvocation,
  extra?: AgentCodeReferences,
): AgentCodeReferences {
  const nodeIds = [
    ...(invocation.nodeIds ?? []),
    ...(invocation.symbolNodeIds ?? []),
    ...(extra?.nodeIds ?? []),
    ...(extra?.symbolNodeIds ?? []),
  ]
  const symbolNodeIds = [
    ...(invocation.symbolNodeIds ?? []),
    ...(extra?.symbolNodeIds ?? []),
  ]

  return normalizeCodeReferences({ nodeIds, symbolNodeIds })
}

export function stripSymbolPathSuffix(value: string) {
  const hashIndex = value.indexOf('#')

  return hashIndex > 0 ? value.slice(0, hashIndex) : value
}

function collectCodeReferences(
  value: unknown,
  nodeIds: Set<string>,
  symbolNodeIds: Set<string>,
  keyHint?: string,
) {
  if (!value || nodeIds.size >= MAX_CODE_REFERENCE_COUNT) {
    return
  }

  if (typeof value === 'string') {
    collectStringReferences(value, nodeIds, symbolNodeIds, keyHint)
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCodeReferences(entry, nodeIds, symbolNodeIds, keyHint)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    collectCodeReferences(entry, nodeIds, symbolNodeIds, key)
  }
}

function collectStringReferences(
  value: string,
  nodeIds: Set<string>,
  symbolNodeIds: Set<string>,
  keyHint?: string,
) {
  const keyLooksNodeLike = keyHint ? keyLooksNodeIdLike(keyHint) : false

  for (const token of extractSymbolNodeIdTokens(value)) {
    addNodeId(nodeIds, token)
    addSymbolNodeId(symbolNodeIds, token)
  }

  if (!keyLooksNodeLike) {
    return
  }

  const cleanedValue = cleanReferenceToken(value)

  if (cleanedValue && !cleanedValue.includes('\n')) {
    addNodeId(nodeIds, cleanedValue)
  }
}

function extractSymbolNodeIdTokens(value: string) {
  const directValue = cleanReferenceToken(value)

  if (isSymbolNodeId(directValue)) {
    return [directValue]
  }

  const matches = value.match(/symbol:[^\s'",)\]}]+/g) ?? []

  return matches
    .map(cleanReferenceToken)
    .filter(isSymbolNodeId)
}

function addNodeId(output: Set<string>, value: string) {
  if (output.size < MAX_CODE_REFERENCE_COUNT) {
    output.add(value)
  }
}

function addSymbolNodeId(output: Set<string>, value: string) {
  if (output.size < MAX_CODE_REFERENCE_COUNT) {
    output.add(value)
  }
}

function normalizeCodeReferences(input: {
  nodeIds: string[]
  symbolNodeIds: string[]
}): AgentCodeReferences {
  const symbolNodeIds = dedupe(input.symbolNodeIds.filter(isSymbolNodeId))
  const nodeIds = dedupe([...input.nodeIds, ...symbolNodeIds])

  return {
    nodeIds: nodeIds.length > 0 ? nodeIds.slice(0, MAX_CODE_REFERENCE_COUNT) : undefined,
    symbolNodeIds: symbolNodeIds.length > 0
      ? symbolNodeIds.slice(0, MAX_CODE_REFERENCE_COUNT)
      : undefined,
  }
}

function keyLooksNodeIdLike(key: string) {
  const normalizedKey = key.trim().toLowerCase()

  return (
    normalizedKey === 'nodeid' ||
    normalizedKey === 'nodeids' ||
    normalizedKey === 'node_id' ||
    normalizedKey === 'node_ids' ||
    normalizedKey === 'symbolid' ||
    normalizedKey === 'symbolids' ||
    normalizedKey === 'symbol_id' ||
    normalizedKey === 'symbol_ids' ||
    normalizedKey === 'symbolnodeid' ||
    normalizedKey === 'symbolnodeids' ||
    normalizedKey === 'symbol_node_id' ||
    normalizedKey === 'symbol_node_ids' ||
    normalizedKey.endsWith('nodeid') ||
    normalizedKey.endsWith('nodeids') ||
    normalizedKey.endsWith('node_id') ||
    normalizedKey.endsWith('node_ids')
  )
}

function isSymbolNodeId(value: string) {
  return value.startsWith(SYMBOL_NODE_ID_PREFIX) && value.length > SYMBOL_NODE_ID_PREFIX.length
}

function cleanReferenceToken(value: string) {
  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/^[([{<]+/g, '')
    .replace(/[)\]},;>]+$/g, '')
    .trim()
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

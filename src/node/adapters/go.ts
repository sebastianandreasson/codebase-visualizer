import { extname } from 'node:path'

import type {
  LanguageAdapter,
  LanguageAdapterInput,
  LanguageAdapterResult,
} from '../../schema/analysis'
import type { AnalysisFact } from '../../schema/projectPlugin'
import type {
  FileNode,
  GraphEdge,
  ProjectSnapshot,
  SourceRange,
  SymbolNode,
} from '../../schema/snapshot'

import { normalizeRoutePattern } from '../apiEndpointResolver'
import { createEmptySymbolIndex, registerSymbolNodes } from '../symbolIndex'

const GO_SOURCE_EXTENSION = '.go'
const GO_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

interface MutableGoContext {
  edges: GraphEdge[]
  nodes: ProjectSnapshot['nodes']
}

interface GoRouteRegistration {
  framework: string
  handlerName: string
  line: number
  method: string
  routePattern: string
}

export function createGoLanguageAdapter(): LanguageAdapter {
  return {
    id: 'go',
    displayName: 'Go',
    supports: {
      symbols: true,
      imports: false,
      calls: false,
    },
    matches(fileNode) {
      return extname(fileNode.path).toLowerCase() === GO_SOURCE_EXTENSION
    },
    async analyze({
      fileNodes,
      options,
    }: LanguageAdapterInput): Promise<LanguageAdapterResult> {
      const context: MutableGoContext = {
        edges: [],
        nodes: {},
      }
      const symbolIndex = createEmptySymbolIndex()
      const facts: AnalysisFact[] = []

      for (const fileNode of fileNodes) {
        context.nodes[fileNode.id] = {
          ...fileNode,
          language: 'go',
        }

        if (!fileNode.content) {
          continue
        }

        const fileSymbols = options.analyzeSymbols === false
          ? []
          : extractGoSymbols(fileNode, context)

        if (fileSymbols.length > 0) {
          registerSymbolNodes(fileSymbols, symbolIndex)
        }

        facts.push(...extractGoRouteFacts(fileNode, fileSymbols))
      }

      return {
        nodes: context.nodes,
        edges: dedupeEdges(context.edges),
        facts: dedupeFacts(facts),
      }
    },
  }
}

function extractGoSymbols(fileNode: FileNode, context: MutableGoContext) {
  const lines = fileNode.content?.split(/\r?\n/) ?? []
  const symbols: SymbolNode[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const functionMatch = line.match(
      /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    )

    if (!functionMatch) {
      continue
    }

    const name = functionMatch[1]

    if (!name) {
      continue
    }

    const range = getGoFunctionRange(lines, lineIndex)
    const symbolNode = createSymbolNode(fileNode, name, range)

    symbols.push(symbolNode)
    context.nodes[symbolNode.id] = symbolNode
    context.edges.push({
      id: `contains:${fileNode.id}->${symbolNode.id}`,
      kind: 'contains',
      source: fileNode.id,
      target: symbolNode.id,
    })
  }

  return symbols
}

function extractGoRouteFacts(fileNode: FileNode, fileSymbols: SymbolNode[]) {
  const lines = fileNode.content?.split(/\r?\n/) ?? []
  const symbolByName = new Map(fileSymbols.map((symbol) => [symbol.name, symbol]))
  const facts: AnalysisFact[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const routeRegistration = parseGoRouteRegistration(lines[lineIndex] ?? '', lineIndex + 1)

    if (!routeRegistration) {
      continue
    }

    const handlerSymbol = symbolByName.get(getHandlerName(routeRegistration.handlerName))

    facts.push(createFact(fileNode.path, 'http_server_endpoint', handlerSymbol?.id ?? fileNode.id, {
      confidence: handlerSymbol ? 0.88 : 0.68,
      framework: routeRegistration.framework,
      line: routeRegistration.line,
      method: routeRegistration.method,
      normalizedRoutePattern: normalizeRoutePattern(routeRegistration.routePattern),
      routePattern: routeRegistration.routePattern,
    }))
  }

  return facts
}

function parseGoRouteRegistration(line: string, lineNumber: number): GoRouteRegistration | null {
  const methodRouteMatch = line.match(
    /\b([A-Za-z_][A-Za-z0-9_]*)\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Get|Post|Put|Patch|Delete|Head|Options)\(\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)/,
  )

  if (methodRouteMatch) {
    const [, receiver = '', method = '', routePattern = '', handlerName = ''] = methodRouteMatch
    return {
      framework: inferGoFramework(receiver, method),
      handlerName,
      line: lineNumber,
      method: method.toUpperCase(),
      routePattern,
    }
  }

  const handleFuncMatch = line.match(
    /\b(?:http\.)?(?:HandleFunc|Handle)\(\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)/,
  )

  if (!handleFuncMatch) {
    return null
  }

  const [, rawPattern = '', handlerName = ''] = handleFuncMatch
  const prefixedMethodMatch = rawPattern.match(/^([A-Z]+)\s+(.+)$/)
  const method = prefixedMethodMatch?.[1]
  const routePattern = prefixedMethodMatch?.[2] ?? rawPattern

  return {
    framework: 'net/http',
    handlerName,
    line: lineNumber,
    method: method && GO_HTTP_METHODS.has(method) ? method : 'ANY',
    routePattern,
  }
}

function inferGoFramework(receiver: string, method: string) {
  if (method === method.toUpperCase()) {
    return 'gin/echo/fiber'
  }

  return receiver.toLowerCase().includes('chi') ? 'chi' : 'go-router'
}

function getHandlerName(handlerName: string) {
  const segments = handlerName.split('.')
  return segments[segments.length - 1] ?? handlerName
}

function getGoFunctionRange(lines: string[], startLineIndex: number): SourceRange {
  let braceDepth = 0
  let sawOpeningBrace = false
  let endLineIndex = startLineIndex

  for (let index = startLineIndex; index < lines.length; index += 1) {
    const line = stripGoLineComment(lines[index] ?? '')

    for (const char of line) {
      if (char === '{') {
        braceDepth += 1
        sawOpeningBrace = true
      }

      if (char === '}') {
        braceDepth -= 1
      }
    }

    endLineIndex = index

    if (sawOpeningBrace && braceDepth <= 0) {
      break
    }
  }

  return {
    start: {
      line: startLineIndex + 1,
      column: lines[startLineIndex]?.match(/^\s*/)?.[0].length ?? 0,
    },
    end: {
      line: endLineIndex + 1,
      column: lines[endLineIndex]?.length ?? 0,
    },
  }
}

function stripGoLineComment(line: string) {
  return line.replace(/\/\/.*$/, '')
}

function createSymbolNode(
  fileNode: FileNode,
  name: string,
  range: SourceRange,
): SymbolNode {
  const rangeId = `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`

  return {
    id: `symbol:${fileNode.id}:${name}:${rangeId}`,
    kind: 'symbol',
    name,
    path: `${fileNode.path}#${name}@${range.start.line}:${range.start.column}`,
    tags: [],
    facets: [],
    fileId: fileNode.id,
    parentSymbolId: null,
    language: 'go',
    symbolKind: 'function',
    nativeSymbolKind: 'function',
    visibility: /^[A-Z]/.test(name) ? 'public' : 'private',
    signature: name,
    range,
  }
}

function createFact(
  path: string,
  kind: string,
  subjectId: string,
  data?: AnalysisFact['data'],
): AnalysisFact {
  return {
    id: `${kind}:${subjectId}:${JSON.stringify(data ?? {})}`,
    namespace: 'go',
    kind,
    subjectId,
    path,
    data,
  }
}

function dedupeEdges(edges: GraphEdge[]) {
  const uniqueEdges = new Map(edges.map((edge) => [edge.id, edge]))
  return [...uniqueEdges.values()]
}

function dedupeFacts(facts: AnalysisFact[]) {
  const uniqueFacts = new Map(facts.map((fact) => [fact.id, fact]))
  return [...uniqueFacts.values()]
}

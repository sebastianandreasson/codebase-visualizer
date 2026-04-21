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
  SymbolKind,
  SymbolNode,
} from '../../schema/snapshot'

import { normalizeRoutePattern } from '../apiEndpointResolver'
import { createEmptySymbolIndex, registerSymbolNodes } from '../symbolIndex'

const DART_SOURCE_EXTENSION = '.dart'
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
const CONTROL_WORDS = new Set(['catch', 'for', 'if', 'switch', 'while'])

interface MutableDartContext {
  edges: GraphEdge[]
  nodes: ProjectSnapshot['nodes']
}

interface DartSymbolDeclaration {
  indent: number
  kind: SymbolKind
  lineIndex: number
  name: string
  parentSymbolId: string | null
  symbolNode: SymbolNode
}

export function createDartLanguageAdapter(): LanguageAdapter {
  return {
    id: 'dart',
    displayName: 'Dart',
    supports: {
      symbols: true,
      imports: false,
      calls: false,
    },
    matches(fileNode) {
      return extname(fileNode.path).toLowerCase() === DART_SOURCE_EXTENSION
    },
    async analyze({
      fileNodes,
      options,
    }: LanguageAdapterInput): Promise<LanguageAdapterResult> {
      const context: MutableDartContext = {
        edges: [],
        nodes: {},
      }
      const symbolIndex = createEmptySymbolIndex()
      const facts: AnalysisFact[] = []

      for (const fileNode of fileNodes) {
        context.nodes[fileNode.id] = {
          ...fileNode,
          language: 'dart',
        }

        if (!fileNode.content) {
          continue
        }

        const fileSymbols = options.analyzeSymbols === false
          ? []
          : extractDartSymbols(fileNode, context)

        if (fileSymbols.length > 0) {
          registerSymbolNodes(fileSymbols, symbolIndex)
        }

        facts.push(...extractDartHttpClientFacts(fileNode, fileSymbols))
      }

      return {
        nodes: context.nodes,
        edges: dedupeEdges(context.edges),
        facts: dedupeFacts(facts),
      }
    },
  }
}

function extractDartSymbols(
  fileNode: FileNode,
  context: MutableDartContext,
) {
  const lines = fileNode.content?.split(/\r?\n/) ?? []
  const declarations: DartSymbolDeclaration[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const declaration = parseDeclaration(line)

    if (!declaration) {
      continue
    }

    const parent = findParentDeclaration(declarations, declaration.indent)
    const range = getDeclarationRange(lines, lineIndex, declaration.indent)
    const symbolNode = createSymbolNode(
      fileNode,
      declaration.name,
      declaration.kind,
      range,
      parent?.symbolNode.id ?? null,
    )

    declarations.push({
      ...declaration,
      lineIndex,
      parentSymbolId: parent?.symbolNode.id ?? null,
      symbolNode,
    })
    context.nodes[symbolNode.id] = symbolNode
    context.edges.push({
      id: `contains:${symbolNode.parentSymbolId ?? fileNode.id}->${symbolNode.id}`,
      kind: 'contains',
      source: symbolNode.parentSymbolId ?? fileNode.id,
      target: symbolNode.id,
    })
  }

  return declarations.map((declaration) => declaration.symbolNode)
}

function extractDartHttpClientFacts(fileNode: FileNode, fileSymbols: SymbolNode[]) {
  const lines = fileNode.content?.split(/\r?\n/) ?? []
  const facts: AnalysisFact[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const requests = parseHttpRequestsFromLine(line)

    for (const request of requests) {
      const normalizedPath = normalizeRoutePattern(request.pathTemplate)

      if (!normalizedPath) {
        continue
      }

      const lineNumber = lineIndex + 1
      const sourceSymbol = findSymbolContainingLine(fileSymbols, lineNumber)
      facts.push(createFact(fileNode.path, 'http_client_request', sourceSymbol?.id ?? fileNode.id, {
        client: request.client,
        column: request.column,
        confidence: request.confidence,
        line: lineNumber,
        method: request.method,
        normalizedPath,
        pathTemplate: request.pathTemplate,
      }))
    }
  }

  return facts
}

function parseHttpRequestsFromLine(line: string) {
  const requests: Array<{
    client: string
    column: number
    confidence: number
    method: string
    pathTemplate: string
  }> = []
  const callPattern =
    /\b((?:[A-Za-z_][A-Za-z0-9_]*|this\.[A-Za-z_][A-Za-z0-9_]*|Dio\(\))(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\.\s*(get|post|put|patch|delete|head)\s*\(/g
  let match: RegExpExecArray | null

  while ((match = callPattern.exec(line)) !== null) {
    const client = match[1] ?? ''
    const method = match[2]?.toUpperCase() ?? ''

    if (!HTTP_METHODS.has(method)) {
      continue
    }

    const argsStart = match.index + match[0].length
    const args = readBalancedCallArguments(line, argsStart)
    const pathTemplate = extractDartUrlTemplate(args)

    if (!pathTemplate) {
      continue
    }

    requests.push({
      client,
      column: match.index + 1,
      confidence: pathTemplate.startsWith('http') ? 0.76 : 0.84,
      method,
      pathTemplate,
    })
  }

  return requests
}

function readBalancedCallArguments(line: string, startIndex: number) {
  let depth = 1
  let quote: string | null = null
  let escaped = false

  for (let index = startIndex; index < line.length; index += 1) {
    const char = line[index]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(') {
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1

      if (depth === 0) {
        return line.slice(startIndex, index)
      }
    }
  }

  return line.slice(startIndex)
}

function extractDartUrlTemplate(args: string) {
  const uriHttpMatch = args.match(
    /Uri\.(?:http|https)\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/,
  )

  if (uriHttpMatch?.[1]) {
    return normalizeDartStringInterpolation(uriHttpMatch[1])
  }

  const uriParseMatch = args.match(/Uri\.parse\(\s*(?:r)?["']([^"']+)["']\s*\)/)

  if (uriParseMatch?.[1]) {
    return normalizeDartStringInterpolation(uriParseMatch[1])
  }

  const firstStringMatch = args.match(/(?:r)?["']([^"']+)["']/)

  if (!firstStringMatch?.[1]) {
    return null
  }

  return normalizeDartStringInterpolation(firstStringMatch[1])
}

function normalizeDartStringInterpolation(value: string) {
  return value
    .replace(/\$\{[^}]+\}/g, '${param}')
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '${param}')
}

function parseDeclaration(line: string):
  | { indent: number; kind: SymbolKind; name: string }
  | null {
  const classMatch = line.match(/^(\s*)class\s+([A-Za-z_][A-Za-z0-9_]*)/)

  if (classMatch?.[2]) {
    return {
      indent: classMatch[1]?.length ?? 0,
      kind: 'class',
      name: classMatch[2],
    }
  }

  const functionMatch = line.match(
    /^(\s*)(?:(?:static|external|factory)\s+)?(?:[A-Za-z_][A-Za-z0-9_<>,? ]*\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:async\s*)?(?:\{|=>)/,
  )
  const name = functionMatch?.[2]

  if (!name || CONTROL_WORDS.has(name)) {
    return null
  }

  return {
    indent: functionMatch[1]?.length ?? 0,
    kind: 'function',
    name,
  }
}

function findParentDeclaration(
  declarations: DartSymbolDeclaration[],
  indent: number,
) {
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index]

    if (declaration && declaration.indent < indent) {
      return declaration
    }
  }

  return null
}

function getDeclarationRange(
  lines: string[],
  startLineIndex: number,
  indent: number,
): SourceRange {
  let endLineIndex = startLineIndex

  for (let index = startLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    if (!line.trim()) {
      endLineIndex = index
      continue
    }

    const lineIndent = line.match(/^\s*/)?.[0].length ?? 0

    if (lineIndent <= indent && parseDeclaration(line)) {
      break
    }

    endLineIndex = index
  }

  return {
    start: {
      line: startLineIndex + 1,
      column: indent + 1,
    },
    end: {
      line: endLineIndex + 1,
      column: Math.max(1, (lines[endLineIndex] ?? '').length + 1),
    },
  }
}

function findSymbolContainingLine(symbols: SymbolNode[], line: number) {
  return symbols.find((symbol) => {
    const range = symbol.range

    return Boolean(range && range.start.line <= line && range.end.line >= line)
  }) ?? null
}

function createSymbolNode(
  fileNode: FileNode,
  name: string,
  kind: SymbolKind,
  range: SourceRange,
  parentSymbolId: string | null,
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
    parentSymbolId,
    language: 'dart',
    symbolKind: kind,
    nativeSymbolKind: kind,
    visibility: name.startsWith('_') ? 'private' : 'unknown',
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
    namespace: 'dart',
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

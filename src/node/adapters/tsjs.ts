import { dirname, extname, resolve } from 'node:path'

import ts from 'typescript'

import type {
  LanguageAdapter,
  LanguageAdapterInput,
  LanguageAdapterResult,
} from '../../schema/analysis'
import type {
  FileNode,
  GraphEdge,
  ProjectSnapshot,
  SourceRange,
  SymbolKind,
  SymbolNode,
} from '../../schema/snapshot'

import { buildJsCallGraph } from '../jsCallgraph'
import { createEmptySymbolIndex, registerSymbolNodes } from '../symbolIndex'

const IMPORTABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
])

const ENTRYPOINT_BASENAMES = new Set([
  'main.ts',
  'main.tsx',
  'main.js',
  'main.jsx',
  'index.tsx',
  'index.jsx',
  'server.ts',
  'server.js',
])

interface MutableSnapshotContext {
  edges: GraphEdge[]
  nodes: ProjectSnapshot['nodes']
}

export function createTsJsLanguageAdapter(): LanguageAdapter {
  return {
    id: 'ts-js',
    displayName: 'TypeScript / JavaScript',
    supports: {
      symbols: true,
      imports: true,
      calls: true,
    },
    matches(fileNode) {
      return IMPORTABLE_EXTENSIONS.has(extname(fileNode.path).toLowerCase())
    },
    async analyze({
      snapshot,
      fileNodes,
      options,
    }: LanguageAdapterInput): Promise<LanguageAdapterResult> {
      const context: MutableSnapshotContext = {
        edges: [],
        nodes: { ...snapshot.nodes },
      }

      for (const fileNode of fileNodes) {
        context.nodes[fileNode.id] = {
          ...fileNode,
          language: getFileLanguage(fileNode.path),
        }
      }

      const symbolIndex =
        options.analyzeSymbols === false
          ? createEmptySymbolIndex()
          : extractSymbols(fileNodes, context)
      const entryFileIds = detectEntrypoints(fileNodes, context.nodes)

      if (options.analyzeImports !== false) {
        context.edges.push(...extractImportEdges(snapshot, fileNodes))
      }

      const analysisSnapshot: ProjectSnapshot = {
        ...snapshot,
        entryFileIds,
        nodes: context.nodes,
        edges: [...snapshot.edges, ...context.edges],
      }

      if (options.analyzeCalls) {
        const callGraph = await buildJsCallGraph(analysisSnapshot, symbolIndex)
        context.edges.push(...callGraph.edges)

        for (const symbolNode of Object.values(callGraph.symbolNodes)) {
          context.nodes[symbolNode.id] = symbolNode
        }
      }

      return {
        nodes: context.nodes,
        edges: dedupeEdges(context.edges),
        entryFileIds,
      }
    },
  }
}

function detectEntrypoints(
  fileNodes: FileNode[],
  nodes: ProjectSnapshot['nodes'],
) {
  const entryFileIds = fileNodes
    .filter((fileNode) => {
      if (ENTRYPOINT_BASENAMES.has(fileNode.name)) {
        return true
      }

      return fileNode.path.startsWith('src/') && ENTRYPOINT_BASENAMES.has(fileNode.name)
    })
    .map((fileNode) => fileNode.id)

  for (const fileId of entryFileIds) {
    const node = nodes[fileId]

    if (!node || node.kind !== 'file') {
      continue
    }

    nodes[fileId] = {
      ...node,
      tags: Array.from(new Set([...node.tags, 'entrypoint'])),
    }
  }

  return entryFileIds
}

function extractImportEdges(
  snapshot: ProjectSnapshot,
  fileNodes: FileNode[],
) {
  const fileIdByAbsolutePath = new Map<string, string>()

  for (const fileNode of fileNodes) {
    fileIdByAbsolutePath.set(resolve(snapshot.rootDir, fileNode.path), fileNode.id)
  }

  const edges: GraphEdge[] = []

  for (const fileNode of fileNodes) {
    if (!fileNode.content) {
      continue
    }

    const sourceFile = ts.createSourceFile(
      fileNode.path,
      fileNode.content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(fileNode.path),
    )

    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      const targetFileId = resolveImportTarget(
        fileNode,
        specifier,
        snapshot,
        fileIdByAbsolutePath,
      )

      if (!targetFileId) {
        continue
      }

      edges.push({
        id: `imports:${fileNode.id}->${targetFileId}:${specifier}`,
        kind: 'imports',
        source: fileNode.id,
        target: targetFileId,
        label: specifier,
      })
    }
  }

  return dedupeEdges(edges)
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile) {
  const specifiers: string[] = []

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier

      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        specifiers.push(moduleSpecifier.text)
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return specifiers
}

function resolveImportTarget(
  sourceFile: FileNode,
  specifier: string,
  snapshot: ProjectSnapshot,
  fileIdByAbsolutePath: Map<string, string>,
) {
  if (!specifier.startsWith('.')) {
    return null
  }

  const absoluteSpecifier = resolve(
    snapshot.rootDir,
    dirname(sourceFile.path),
    specifier,
  )

  for (const candidate of buildImportCandidates(absoluteSpecifier)) {
    const fileId = fileIdByAbsolutePath.get(candidate)

    if (fileId) {
      return fileId
    }
  }

  return null
}

function buildImportCandidates(absoluteSpecifier: string) {
  const candidates = [absoluteSpecifier]

  if (extname(absoluteSpecifier)) {
    return candidates
  }

  for (const extension of IMPORTABLE_EXTENSIONS) {
    candidates.push(`${absoluteSpecifier}${extension}`)
    candidates.push(resolve(absoluteSpecifier, `index${extension}`))
  }

  return candidates
}

function extractSymbols(fileNodes: FileNode[], context: MutableSnapshotContext) {
  const symbolIndex = createEmptySymbolIndex()

  for (const fileNode of fileNodes) {
    if (!fileNode.content) {
      continue
    }

    const sourceFile = ts.createSourceFile(
      fileNode.path,
      fileNode.content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(fileNode.path),
    )

    const fileSymbols: SymbolNode[] = []

    collectSymbolsFromNode(
      sourceFile,
      sourceFile,
      fileNode,
      fileSymbols,
      context,
      null,
    )

    if (fileSymbols.length > 0) {
      registerSymbolNodes(fileSymbols, symbolIndex)
    }
  }

  return symbolIndex
}

function collectSymbolsFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  fileNode: FileNode,
  fileSymbols: SymbolNode[],
  context: MutableSnapshotContext,
  parentSymbolId: string | null,
) {
  const symbolMetadata = getSymbolMetadata(node, sourceFile)
  let currentParentSymbolId = parentSymbolId

  if (symbolMetadata) {
    const symbolNode = createSymbolNode(
      fileNode,
      symbolMetadata.name,
      symbolMetadata.kind,
      symbolMetadata.range,
      parentSymbolId,
    )

    fileSymbols.push(symbolNode)
    context.nodes[symbolNode.id] = symbolNode
    context.edges.push({
      id: `contains:${parentSymbolId ?? fileNode.id}->${symbolNode.id}`,
      kind: 'contains',
      source: parentSymbolId ?? fileNode.id,
      target: symbolNode.id,
    })
    currentParentSymbolId = symbolNode.id
  }

  ts.forEachChild(node, (child) => {
    collectSymbolsFromNode(
      child,
      sourceFile,
      fileNode,
      fileSymbols,
      context,
      currentParentSymbolId,
    )
  })
}

function getSymbolMetadata(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): { name: string; kind: SymbolKind; range: SourceRange } | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return {
      name: node.name.text,
      kind: 'function',
      range: getSourceRange(node, sourceFile),
    }
  }

  if (ts.isClassDeclaration(node) && node.name) {
    return {
      name: node.name.text,
      kind: 'class',
      range: getSourceRange(node, sourceFile),
    }
  }

  if (
    ts.isMethodDeclaration(node) &&
    node.name &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  ) {
    return {
      name: node.name.text,
      kind: 'method',
      range: getSourceRange(node, sourceFile),
    }
  }

  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer))
  ) {
    return {
      name: node.name.text,
      kind: 'function',
      range: getSourceRange(node, sourceFile),
    }
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return {
      name: node.name.text,
      kind: isConstDeclaration(node) ? 'constant' : 'variable',
      range: getSourceRange(node, sourceFile),
    }
  }

  return null
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
    fileId: fileNode.id,
    parentSymbolId,
    language: getFileLanguage(fileNode.path),
    symbolKind: kind,
    nativeSymbolKind: kind,
    visibility: 'unknown',
    signature: name,
    range,
  }
}

function getSourceRange(node: ts.Node, sourceFile: ts.SourceFile): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())

  return {
    start: {
      line: start.line + 1,
      column: start.character,
    },
    end: {
      line: end.line + 1,
      column: end.character,
    },
  }
}

function isConstDeclaration(node: ts.VariableDeclaration) {
  return (
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & ts.NodeFlags.Const) !== 0
  )
}

function getScriptKind(path: string) {
  if (path.endsWith('.tsx')) {
    return ts.ScriptKind.TSX
  }

  if (path.endsWith('.ts')) {
    return ts.ScriptKind.TS
  }

  if (path.endsWith('.jsx')) {
    return ts.ScriptKind.JSX
  }

  return ts.ScriptKind.JS
}

function getFileLanguage(path: string) {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    return 'typescript'
  }

  return 'javascript'
}

function dedupeEdges(edges: GraphEdge[]) {
  const uniqueEdges = new Map<string, GraphEdge>()

  for (const edge of edges) {
    uniqueEdges.set(edge.id, edge)
  }

  return [...uniqueEdges.values()]
}

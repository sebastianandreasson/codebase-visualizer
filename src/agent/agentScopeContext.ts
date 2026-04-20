import type {
  CodebaseFile,
  ProjectNode,
  SourceRange,
  SymbolNode,
} from '../types'

export const MAX_VISIBLE_CONTEXT_FILES = 6

export interface AgentScopeContext {
  file: CodebaseFile | null
  files: CodebaseFile[]
  node: ProjectNode | null
  symbol: SymbolNode | null
  symbols: SymbolNode[]
}

export function describeInspectorContext(inspectorContext: AgentScopeContext) {
  if (inspectorContext.symbol) {
    const rangeText = inspectorContext.symbol.range
      ? ` at lines ${formatRange(inspectorContext.symbol.range)}`
      : ''
    return `${inspectorContext.symbol.symbolKind}${rangeText}. Requests will default to this symbol.`
  }

  if (inspectorContext.symbols.length > 1) {
    return `Requests will default to this ${inspectorContext.symbols.length}-symbol edit set.`
  }

  if (inspectorContext.files.length > 1) {
    return `Requests will default to this ${inspectorContext.files.length}-file edit set.`
  }

  if (inspectorContext.file) {
    return 'Requests will default to this file.'
  }

  if (inspectorContext.node) {
    return `Requests will default to this ${inspectorContext.node.kind}.`
  }

  return ''
}

export function hasScopeContext(
  context: AgentScopeContext | null | undefined,
): context is AgentScopeContext {
  return Boolean(
    context &&
      (
        context.file ||
        context.files.length > 0 ||
        context.symbols.length > 0 ||
        context.symbol ||
        context.node
      ),
  )
}

export function buildScopeContextLines(context: AgentScopeContext) {
  const contextLines: string[] = []

  if (context.symbols.length > 1) {
    contextLines.push('Selected symbols (primary first):')

    for (const symbol of context.symbols) {
      contextLines.push(`- ${symbol.path}`)
    }
  } else if (context.files.length > 1) {
    contextLines.push('Selected files (primary first):')

    for (const file of context.files) {
      contextLines.push(`- ${file.path}`)
    }
  } else if (context.file) {
    contextLines.push(`Selected file: ${context.file.path}`)
  }

  if (context.symbol) {
    contextLines.push(`Selected symbol: ${context.symbol.path}`)
    contextLines.push(`Selected symbol kind: ${context.symbol.symbolKind}`)
    if (context.symbol.facets.length > 0) {
      contextLines.push(`Selected symbol facets: ${context.symbol.facets.join(', ')}`)
    }

    if (context.symbol.range) {
      contextLines.push(`Selected symbol range: lines ${formatRange(context.symbol.range)}`)
    }
  } else if (context.file) {
    if (context.file.facets.length > 0) {
      contextLines.push(`Selected file facets: ${context.file.facets.join(', ')}`)
    }
  } else if (context.node) {
    contextLines.push(`Selected node: ${context.node.path}`)
    contextLines.push(`Selected node kind: ${context.node.kind}`)
    if (context.node.facets.length > 0) {
      contextLines.push(`Selected node facets: ${context.node.facets.join(', ')}`)
    }
  }

  return contextLines
}

export function buildScopeMetadata(context: AgentScopeContext) {
  const paths = getScopePaths(context)

  if (paths.length === 0) {
    return null
  }

  return {
    paths,
    symbolPaths: getScopeSymbolPaths(context),
    title: describeScopeContextTitle(context),
  }
}

export function getScopePaths(context: AgentScopeContext) {
  const paths = new Set<string>()

  if (context.file) {
    paths.add(context.file.path)
  }

  for (const file of context.files) {
    paths.add(file.path)
  }

  if (context.symbol) {
    const ownerFile = context.files.find((file) => file.id === context.symbol?.fileId)

    if (ownerFile) {
      paths.add(ownerFile.path)
    }
  }

  return [...paths]
}

export function getScopeSymbolPaths(context: AgentScopeContext) {
  const symbolPaths = new Set<string>()

  if (context.symbol) {
    symbolPaths.add(context.symbol.path)
  }

  for (const symbol of context.symbols) {
    symbolPaths.add(symbol.path)
  }

  return [...symbolPaths]
}

export function describeScopeContextTitle(context: AgentScopeContext) {
  if (context.symbols.length > 1) {
    return `${context.symbols.length} selected symbols`
  }

  if (context.files.length > 1) {
    return `${context.files.length} selected files`
  }

  return context.symbol?.path ?? context.file?.path ?? context.node?.path ?? 'Current selection'
}

export function areScopeContextsEquivalent(
  left: AgentScopeContext | null | undefined,
  right: AgentScopeContext | null | undefined,
) {
  if (!hasScopeContext(left) || !hasScopeContext(right)) {
    return false
  }

  const leftIds = getScopeContextNodeIds(left)
  const rightIds = getScopeContextNodeIds(right)

  if (leftIds.length !== rightIds.length) {
    return false
  }

  return leftIds.every((nodeId, index) => nodeId === rightIds[index])
}

export function getScopeContextNodeIds(context: AgentScopeContext) {
  if (context.symbols.length > 0) {
    return context.symbols.map((symbol) => symbol.id)
  }

  if (context.files.length > 0) {
    return context.files.map((file) => file.id)
  }

  if (context.symbol) {
    return [context.symbol.id]
  }

  if (context.file) {
    return [context.file.id]
  }

  return context.node ? [context.node.id] : []
}

export function formatRange(range: SourceRange) {
  const startLine = range.start.line
  const endLine = range.end.line

  return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`
}

import { isAbsolute, relative } from 'node:path'

import type {
  AgentFileOperation,
  AgentFileOperationConfidence,
  AgentFileOperationKind,
  AgentFileOperationRange,
  AgentFileOperationSource,
  AgentFileOperationStatus,
  AgentMessage,
  AgentToolInvocation,
} from '../../schema/agent'
import {
  deriveToolCodeReferences,
  mergeToolCodeReferences,
  stripSymbolPathSuffix,
} from './agentCodeReferences'

const MAX_OPERATION_PATHS = 12

const DIRECT_READ_TOOL_NAMES = new Set([
  'findsymbols',
  'getsymbolneighborhood',
  'getsymboloutline',
  'getsymbolworkspacesummary',
  'readfilewindow',
  'readsymbolslice',
])

const DIRECT_READ_MARKERS = [
  'cat',
  'find',
  'grep',
  'list',
  'ls',
  'open',
  'read',
  'search',
  'view',
]

const DIRECT_WRITE_MARKERS = [
  'apply',
  'create',
  'edit',
  'insert',
  'modify',
  'patch',
  'replace',
  'save',
  'write',
]

const DIRECT_DELETE_MARKERS = [
  'delete',
  'remove',
  'rm',
  'unlink',
]

const DIRECT_RENAME_MARKERS = [
  'move',
  'mv',
  'rename',
]

const SHELL_TOOL_NAMES = new Set([
  'bash',
  'exec',
  'exec_command',
  'shell',
  'terminal',
])

export function createFileOperationsFromToolInvocation(input: {
  invocation: AgentToolInvocation
  sessionId: string
  source?: AgentFileOperationSource
  status?: AgentFileOperationStatus
  timestamp?: string
  workspaceRootDir?: string
}): AgentFileOperation[] {
  const status = input.status ?? getInvocationStatus(input.invocation)
  const timestamp = input.timestamp ?? getInvocationTimestamp(input.invocation, status)
  const source = input.source ?? 'agent-tool'
  const shellCommand = getShellCommand(input.invocation.args)
  const isShellTool = isShellToolName(input.invocation.toolName)
  const pathSet = new Set<string>()

  for (const pathValue of input.invocation.paths ?? []) {
    addNormalizedPath(pathSet, pathValue, input.workspaceRootDir)
  }

  collectPathLikeValues(input.invocation.args, pathSet, input.workspaceRootDir)

  const parsedResultPreview = parseJsonPreview(input.invocation.resultPreview)
  if (parsedResultPreview !== undefined) {
    collectPathLikeValues(parsedResultPreview, pathSet, input.workspaceRootDir)
  }
  const codeReferences = mergeToolCodeReferences(
    input.invocation,
    deriveToolCodeReferences(
      input.invocation.toolName,
      input.invocation.args,
      parsedResultPreview,
    ),
  )
  const operationRanges = deriveToolOperationRanges({
    args: input.invocation.args,
    result: parsedResultPreview,
    symbolNodeIds: codeReferences.symbolNodeIds,
    toolName: input.invocation.toolName,
    workspaceRootDir: input.workspaceRootDir,
  })

  if (isShellTool && shellCommand) {
    for (const pathValue of extractShellPathTokens(shellCommand)) {
      addNormalizedPath(pathSet, pathValue, input.workspaceRootDir)
    }
  }

  const paths = [...pathSet].slice(0, MAX_OPERATION_PATHS)
  const classification = isShellTool
    ? classifyShellInvocation(shellCommand)
    : classifyDirectInvocation(input.invocation.toolName, input.invocation.args, paths)

  if (paths.length === 0) {
    if (isShellTool && shellCommand) {
      return [
        createOperation({
          confidence: classification.confidence,
          invocation: input.invocation,
          kind: 'shell_command',
          nodeIds: codeReferences.nodeIds,
          path: undefined,
          paths: [],
          sessionId: input.sessionId,
          source,
          status,
          symbolNodeIds: codeReferences.symbolNodeIds,
          operationRanges,
          timestamp,
        }),
      ]
    }

    return []
  }

  return paths.map((pathValue, index) =>
    createOperation({
      confidence: classification.confidence,
      invocation: input.invocation,
      kind: classification.kind,
      nodeIds: codeReferences.nodeIds,
      path: pathValue,
      pathIndex: index,
      paths,
      sessionId: input.sessionId,
      source,
      status,
      symbolNodeIds: codeReferences.symbolNodeIds,
      operationRanges: filterOperationRangesForPath(operationRanges, pathValue),
      timestamp,
    }),
  )
}

export function createFileOperationsFromAgentMessage(input: {
  message: AgentMessage
  sessionId: string
  source?: AgentFileOperationSource
  workspaceRootDir?: string
}): AgentFileOperation[] {
  if (input.message.role !== 'assistant') {
    return []
  }

  const pathSet = new Set<string>()

  for (const block of input.message.blocks) {
    if (block.kind === 'text') {
      collectMessagePathReferences(block.text, pathSet, input.workspaceRootDir)
    }
  }

  const paths = [...pathSet].slice(0, MAX_OPERATION_PATHS)
  const timestamp = input.message.createdAt
  const source = input.source ?? 'assistant-message'
  const status: AgentFileOperationStatus = input.message.isStreaming
    ? 'running'
    : 'completed'
  const invocation: AgentToolInvocation = {
    args: { messageId: input.message.id },
    endedAt: status === 'completed' ? timestamp : undefined,
    startedAt: timestamp,
    toolCallId: `message:${input.message.id}`,
    toolName: 'assistant_message',
  }

  return paths.map((pathValue, index) =>
    createOperation({
      confidence: 'fallback',
      invocation,
      kind: 'file_read',
      path: pathValue,
      pathIndex: index,
      paths,
      sessionId: input.sessionId,
      source,
      status,
      timestamp,
    }),
  )
}

export function isFileChangingOperationKind(kind: AgentFileOperationKind) {
  return (
    kind === 'file_changed' ||
    kind === 'file_delete' ||
    kind === 'file_rename' ||
    kind === 'file_write'
  )
}

function createOperation(input: {
  confidence: AgentFileOperationConfidence
  invocation: AgentToolInvocation
  kind: AgentFileOperationKind
  nodeIds?: string[]
  path?: string
  pathIndex?: number
  paths: string[]
  sessionId: string
  source: AgentFileOperationSource
  status: AgentFileOperationStatus
  symbolNodeIds?: string[]
  operationRanges?: AgentFileOperationRange[]
  timestamp: string
}): AgentFileOperation {
  return {
    confidence: input.confidence,
    id: buildOperationId({
      invocation: input.invocation,
      kind: input.kind,
      path: input.path,
      pathIndex: input.pathIndex ?? 0,
      sessionId: input.sessionId,
    }),
    kind: input.kind,
    nodeIds: input.nodeIds,
    path: input.path,
    paths: input.paths,
    operationRanges: input.operationRanges,
    resultPreview: input.invocation.resultPreview,
    sessionId: input.sessionId,
    source: input.source,
    status: input.status,
    symbolNodeIds: input.symbolNodeIds,
    timestamp: input.timestamp,
    toolCallId: input.invocation.toolCallId,
    toolName: input.invocation.toolName,
  }
}

function classifyDirectInvocation(
  toolName: string,
  args: unknown,
  paths: string[],
): {
  confidence: AgentFileOperationConfidence
  kind: AgentFileOperationKind
} {
  if (DIRECT_READ_TOOL_NAMES.has(normalizeToolNameKey(toolName))) {
    return { confidence: 'exact', kind: 'file_read' }
  }

  const normalizedText = [
    normalizeClassifyingText(toolName),
    ...getActionTerms(args).map(normalizeClassifyingText),
  ].filter(Boolean).join(' ')

  if (containsAnyMarker(normalizedText, DIRECT_RENAME_MARKERS)) {
    return { confidence: 'exact', kind: 'file_rename' }
  }

  if (containsAnyMarker(normalizedText, DIRECT_DELETE_MARKERS)) {
    return { confidence: 'exact', kind: 'file_delete' }
  }

  if (containsAnyMarker(normalizedText, DIRECT_WRITE_MARKERS)) {
    return { confidence: 'exact', kind: 'file_write' }
  }

  if (containsAnyMarker(normalizedText, DIRECT_READ_MARKERS)) {
    return { confidence: 'exact', kind: 'file_read' }
  }

  return {
    confidence: paths.length > 0 ? 'fallback' : 'inferred',
    kind: paths.length > 0 ? 'file_changed' : 'shell_command',
  }
}

function classifyShellInvocation(command: string): {
  confidence: AgentFileOperationConfidence
  kind: AgentFileOperationKind
} {
  const normalizedCommand = ` ${command.trim().toLowerCase()} `

  if (/\s(mv|rename)\s/.test(normalizedCommand)) {
    return { confidence: 'inferred', kind: 'file_rename' }
  }

  if (/\s(rm|unlink|delete)\s/.test(normalizedCommand)) {
    return { confidence: 'inferred', kind: 'file_delete' }
  }

  if (
    /\bapply_patch\b/.test(normalizedCommand) ||
    /\bsed\s+-[a-z]*i[a-z]*\b/.test(normalizedCommand) ||
    /\bperl\s+-[a-z]*i[a-z]*\b/.test(normalizedCommand) ||
    /\btee\s+/.test(normalizedCommand) ||
    /(^|[\s;&|])>>?\s*[^\s&|]+/.test(normalizedCommand) ||
    /\b(touch|truncate)\s+/.test(normalizedCommand)
  ) {
    return { confidence: 'inferred', kind: 'file_write' }
  }

  if (
    /\b(cat|find|grep|head|less|ls|more|nl|rg|sed|tail)\b/.test(normalizedCommand) ||
    /\bgit\s+(diff|show)\b/.test(normalizedCommand)
  ) {
    return { confidence: 'inferred', kind: 'file_read' }
  }

  return { confidence: 'inferred', kind: 'shell_command' }
}

function getInvocationStatus(invocation: AgentToolInvocation): AgentFileOperationStatus {
  if (!invocation.endedAt) {
    return 'running'
  }

  return invocation.isError ? 'error' : 'completed'
}

function getInvocationTimestamp(
  invocation: AgentToolInvocation,
  status: AgentFileOperationStatus,
) {
  if (status === 'running') {
    return invocation.startedAt
  }

  return invocation.endedAt ?? invocation.startedAt
}

function buildOperationId(input: {
  invocation: AgentToolInvocation
  kind: AgentFileOperationKind
  path?: string
  pathIndex: number
  sessionId: string
}) {
  return [
    'agent-file-operation',
    input.sessionId,
    input.invocation.toolCallId,
    input.kind,
    String(input.pathIndex),
    input.path ?? 'no-path',
  ].map(encodeIdPart).join(':')
}

function encodeIdPart(value: string) {
  return encodeURIComponent(value)
}

function collectPathLikeValues(
  value: unknown,
  output: Set<string>,
  workspaceRootDir?: string,
) {
  if (!value || output.size >= MAX_OPERATION_PATHS) {
    return
  }

  if (typeof value === 'string') {
    addNormalizedPath(output, value, workspaceRootDir)
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathLikeValues(entry, output, workspaceRootDir)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (keyLooksPathLike(key)) {
      collectPathLikeValues(entry, output, workspaceRootDir)
      continue
    }

    if (entry && typeof entry === 'object') {
      collectPathLikeValues(entry, output, workspaceRootDir)
    }
  }
}

function collectMessagePathReferences(
  text: string,
  output: Set<string>,
  workspaceRootDir?: string,
) {
  if (!text || output.size >= MAX_OPERATION_PATHS) {
    return
  }

  const markdownLinkPattern = /\[([^\]]+)]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  for (const match of text.matchAll(markdownLinkPattern)) {
    addNormalizedPath(output, match[1], workspaceRootDir)
    addNormalizedPath(output, match[2], workspaceRootDir)
  }

  const inlineCodePattern = /`([^`\n]+)`/g
  for (const match of text.matchAll(inlineCodePattern)) {
    addNormalizedPath(output, match[1], workspaceRootDir)
  }

  const plainPathPattern =
    /(?:^|[\s([{"'=])((?:~?\/|\.{1,2}\/|[\w@~.-]+[\\/])[\w@~./\\ -]*\.[A-Za-z0-9][\w.-]*)(?=$|[\s)\]},:;"'])/g
  for (const match of text.matchAll(plainPathPattern)) {
    addNormalizedPath(output, match[1], workspaceRootDir)
  }
}

function keyLooksPathLike(key: string) {
  const normalizedKey = key.trim().toLowerCase()

  return (
    normalizedKey === 'file' ||
    normalizedKey === 'files' ||
    normalizedKey === 'filename' ||
    normalizedKey === 'filenames' ||
    normalizedKey === 'filepath' ||
    normalizedKey === 'filepaths' ||
    normalizedKey === 'file_path' ||
    normalizedKey === 'file_paths' ||
    normalizedKey === 'path' ||
    normalizedKey === 'paths' ||
    normalizedKey.endsWith('_path') ||
    normalizedKey.endsWith('path')
  )
}

function addNormalizedPath(
  output: Set<string>,
  value: string,
  workspaceRootDir?: string,
) {
  const normalizedPath = normalizeOperationPath(value, workspaceRootDir)

  if (normalizedPath) {
    output.add(normalizedPath)
  }
}

function normalizeOperationPath(value: string, workspaceRootDir?: string) {
  let normalized = cleanPathToken(value)

  normalized = stripSymbolPathSuffix(normalized)
  normalized = stripLineSuffix(normalized)

  if (!normalized || !looksPathLike(normalized, true)) {
    return null
  }

  if (workspaceRootDir && isAbsolute(normalized)) {
    const relativePath = relative(workspaceRootDir, normalized)
    if (relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)) {
      normalized = relativePath
    }
  }

  normalized = normalized.replace(/\\/g, '/')

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }

  if (!normalized || normalized === '.' || normalized === '/') {
    return null
  }

  return normalized
}

function cleanPathToken(value: string) {
  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/^[([{<]+/g, '')
    .replace(/[)\]},;>]+$/g, '')
    .replace(/^>>?/, '')
    .trim()
}

function stripLineSuffix(value: string) {
  return value.replace(/:(\d+)(?::\d+)?$/g, '')
}

function looksPathLike(value: string, allowBareFile: boolean) {
  const normalized = value.trim()

  if (
    !normalized ||
    normalized.length > 360 ||
    normalized.startsWith('-') ||
    /^[a-z]+:\/\//i.test(normalized)
  ) {
    return false
  }

  return (
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    /^[\w@~.-]+[\\/][\w@~./\\ -]+$/.test(normalized) ||
    (allowBareFile && /^[\w@~.-]+\.[\w.-]+$/.test(normalized))
  )
}

function getShellCommand(args: unknown) {
  if (typeof args === 'string') {
    return args.trim()
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return ''
  }

  for (const key of ['cmd', 'command', 'script']) {
    const entry = (args as Record<string, unknown>)[key]
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim()
    }
  }

  return ''
}

function extractShellPathTokens(command: string) {
  const values = new Set<string>()
  const tokens = command.match(/"([^"\\]|\\.)*"|'[^']*'|`[^`]*`|[^\s]+/g) ?? []

  for (const token of tokens) {
    const cleanedToken = cleanPathToken(token)

    if (looksPathLike(cleanedToken, true)) {
      values.add(cleanedToken)
    }
  }

  return [...values]
}

function isShellToolName(toolName: string) {
  return SHELL_TOOL_NAMES.has(toolName.trim().toLowerCase())
}

function getActionTerms(args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return []
  }

  return ['action', 'command', 'cmd', 'kind', 'mode', 'operation']
    .map((key) => (args as Record<string, unknown>)[key])
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function normalizeClassifyingText(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
}

function normalizeToolNameKey(toolName: string) {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function containsAnyMarker(value: string, markers: string[]) {
  return markers.some((marker) => new RegExp(`(^|\\s)${marker}(\\s|$)`).test(value))
}

function deriveToolOperationRanges(input: {
  args: unknown
  result: unknown
  symbolNodeIds?: string[]
  toolName: string
  workspaceRootDir?: string
}) {
  const toolName = normalizeToolNameKey(input.toolName)
  const result = unwrapToolResult(input.result)
  const resultObject = asRecord(result)
  const ranges: AgentFileOperationRange[] = []
  const symbolNodeIds = uniqueStrings(input.symbolNodeIds ?? [])

  if (toolName === 'readsymbolslice') {
    const path = getPathFromResultOrArgs(resultObject, input.args, input.workspaceRootDir)
    addOperationRange(ranges, {
      kind: 'read',
      label: 'Read symbol slice',
      path,
      range: getSourceRange(resultObject?.contextRange) ?? getSourceRange(resultObject?.exactRange),
      source: 'result',
      symbolNodeIds,
    })
  } else if (toolName === 'getsymboloutline') {
    const outlines = Array.isArray(resultObject?.outlines) ? resultObject.outlines : []

    for (const outline of outlines) {
      const outlineObject = asRecord(outline)
      const previewObject = asRecord(outlineObject?.sourcePreview)
      const symbolObject = asRecord(outlineObject?.symbol)
      const path = getPathFromFileRecord(outlineObject?.file, input.workspaceRootDir)
      const outlineSymbolIds = uniqueStrings([
        typeof symbolObject?.id === 'string' ? symbolObject.id : null,
      ])

      addOperationRange(ranges, {
        kind: 'preview',
        label: 'Outline preview',
        path,
        range: getSourceRange(previewObject?.range),
        source: 'result',
        symbolNodeIds: outlineSymbolIds.length > 0 ? outlineSymbolIds : symbolNodeIds,
      })
    }
  } else if (toolName === 'readfilewindow') {
    const path = getPathFromResultOrArgs(resultObject, input.args, input.workspaceRootDir)
    addOperationRange(ranges, {
      kind: 'read',
      label: 'Read file window',
      path,
      range: getSourceRange(resultObject?.range) ?? getRangeFromLineArgs(input.args),
      source: resultObject?.range ? 'result' : 'args',
      symbolNodeIds,
    })
  } else if (toolName === 'replacefilewindow') {
    const path = getPathFromResultOrArgs(resultObject, input.args, input.workspaceRootDir)
    addOperationRange(ranges, {
      kind: 'edit',
      label: 'Edited file window',
      path,
      range: getSourceRange(resultObject?.replacedRange) ?? getRangeFromLineArgs(input.args),
      source: resultObject?.replacedRange ? 'result' : 'args',
      symbolNodeIds,
    })
  } else if (toolName === 'replacesymbolrange') {
    const path = getPathFromResultOrArgs(resultObject, input.args, input.workspaceRootDir)
    addOperationRange(ranges, {
      kind: 'edit',
      label: 'Edited symbol range',
      path,
      range: getSourceRange(resultObject?.replacedRange),
      source: 'result',
      symbolNodeIds,
    })
  }

  return ranges.length > 0 ? dedupeOperationRanges(ranges) : undefined
}

function filterOperationRangesForPath(
  ranges: AgentFileOperationRange[] | undefined,
  pathValue: string,
) {
  const filteredRanges = (ranges ?? [])
    .filter((range) => !range.path || range.path === pathValue)

  return filteredRanges.length > 0 ? filteredRanges : undefined
}

function addOperationRange(
  ranges: AgentFileOperationRange[],
  input: Omit<AgentFileOperationRange, 'range'> & {
    range: AgentFileOperationRange['range'] | null
  },
) {
  const range = input.range

  if (!range) {
    return
  }

  ranges.push({
    ...input,
    range,
    symbolNodeIds: input.symbolNodeIds?.length ? uniqueStrings(input.symbolNodeIds) : undefined,
  })
}

function dedupeOperationRanges(ranges: AgentFileOperationRange[]) {
  const seenKeys = new Set<string>()
  const result: AgentFileOperationRange[] = []

  for (const range of ranges) {
    const key = [
      range.kind,
      range.path ?? '',
      range.range.start.line,
      range.range.start.column,
      range.range.end.line,
      range.range.end.column,
      range.symbolNodeIds?.join(',') ?? '',
    ].join(':')

    if (seenKeys.has(key)) {
      continue
    }

    seenKeys.add(key)
    result.push(range)
  }

  return result
}

function unwrapToolResult(value: unknown) {
  const objectValue = asRecord(value)

  if (objectValue && 'result' in objectValue) {
    return objectValue.result
  }

  return value
}

function getPathFromResultOrArgs(
  result: Record<string, unknown> | null,
  args: unknown,
  workspaceRootDir?: string,
) {
  return (
    getPathFromFileRecord(result?.file, workspaceRootDir) ??
    getPathFromObject(result, workspaceRootDir) ??
    getPathFromObject(asRecord(args), workspaceRootDir)
  )
}

function getPathFromFileRecord(value: unknown, workspaceRootDir?: string) {
  const file = asRecord(value)
  return getPathFromObject(file, workspaceRootDir)
}

function getPathFromObject(value: Record<string, unknown> | null, workspaceRootDir?: string) {
  if (!value) {
    return undefined
  }

  for (const key of ['path', 'filePath', 'file_path', 'filepath']) {
    const entry = value[key]

    if (typeof entry === 'string') {
      const pathValue = normalizeOperationPath(entry, workspaceRootDir)

      if (pathValue) {
        return pathValue
      }
    }
  }

  return undefined
}

function getRangeFromLineArgs(args: unknown) {
  const argsObject = asRecord(args)

  if (!argsObject) {
    return null
  }

  const startLine = getIntegerArg(argsObject, ['startLine', 'line'])
  const endLine = getIntegerArg(argsObject, ['endLine', 'toLine'])

  if (!startLine || !endLine) {
    return null
  }

  return {
    end: { column: 1, line: Math.max(startLine, endLine) },
    start: { column: 1, line: Math.min(startLine, endLine) },
  }
}

function getIntegerArg(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const entry = value[key]

    if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) {
      return entry
    }

    if (typeof entry === 'string') {
      const parsed = Number(entry)

      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  return null
}

function getSourceRange(value: unknown) {
  const range = asRecord(value)
  const start = asRecord(range?.start)
  const end = asRecord(range?.end)
  const startLine = getPositiveNumber(start?.line)
  const startColumn = getPositiveNumber(start?.column)
  const endLine = getPositiveNumber(end?.line)
  const endColumn = getPositiveNumber(end?.column)

  if (!startLine || !startColumn || !endLine || !endColumn) {
    return null
  }

  return {
    end: { column: endColumn, line: endLine },
    start: { column: startColumn, line: startLine },
  }
}

function getPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(
    values.filter((value): value is string => typeof value === 'string' && value.length > 0),
  )]
}

function parseJsonPreview(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

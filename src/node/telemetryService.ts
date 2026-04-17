import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import {
  appendRequestTelemetryArtifacts,
  deriveRequestTelemetryAnalytics,
  deriveRequestTelemetryBreakdown,
  deriveToolPaths,
  ensureBundledRequestTelemetryExtension,
  getRequestTelemetryPaths,
  readRequestTelemetryRecords,
  readTokenUsageSummary,
  summarizeRequestSpans,
} from '@sebastianandreasson/pi-autonomous-agents'

import { readProjectSnapshot } from './readProjectSnapshot'
import { getPiRunScopedPaths, resolvePiHarnessPaths } from './piHarnessPaths'
import {
  isFileNode,
  isSymbolNode,
  type AgentHeatSample,
  type TelemetryActivityEvent,
  type TelemetryConfidence,
  type TelemetryMode,
  type TelemetryOverview,
  type TelemetryOverviewBucket,
  type TelemetrySource,
  type TelemetryWindow,
} from '../types'

interface InteractiveTelemetryInput {
  kind: string
  message: string
  modelId: string
  provider: string
  promptSequence: number
  rootDir: string
  scope?: {
    paths?: string[]
    scope?: {
      paths: string[]
      symbolPaths?: string[]
      title?: string
    } | null
    task?: string
  }
  sessionId: string
  startedAt: string
  finishedAt: string
  toolInvocations: {
    args: unknown
    toolCallId: string
    toolName: string
  }[]
}

interface InteractiveTelemetryScopeShape {
  paths?: string[]
  scope?: {
    paths: string[]
    symbolPaths?: string[]
    title?: string
  } | null
  task?: string
}

interface RequestRecord {
  [key: string]: unknown
  cacheReadTokens?: number
  cacheWriteTokens?: number
  files?: string[]
  inputTokens?: number
  iteration?: number
  kind?: string
  model?: string
  outputTokens?: number
  phase?: string
  requestId?: string
  role?: string
  runId?: string
  sessionId?: string
  source?: string
  spanSource?: string
  task?: string
  timestamp?: string
  toolNames?: string[]
  totalTokens?: number
  usageSource?: string
}

interface SpanRecord {
  [key: string]: unknown
  byteCount?: number
  paths?: string[]
  primaryPath?: string
  requestId?: string
  spanKind?: string
  timestamp?: string
  toolCallId?: string
  toolName?: string
}

export class AgentTelemetryService {
  async ensureWorkspaceTelemetry(rootDir: string) {
    return ensureBundledRequestTelemetryExtension({
      cwd: rootDir,
      enabled: true,
    })
  }

  async recordInteractivePrompt(input: InteractiveTelemetryInput) {
    const requestId = `semanticode-request:${randomUUID()}`
    const paths = getRequestTelemetryPaths({
      cwd: input.rootDir,
    })
    const spanRecords = buildInteractiveSpanRecords({
      input,
      requestId,
      sessionId: input.sessionId,
    })
    const spanSummary = summarizeRequestSpans(spanRecords)

    await appendRequestTelemetryArtifacts(paths, {
      request: {
        api: 'semanticode',
        contextMessageCount: 1,
        durationMs: Math.max(
          0,
          new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime(),
        ),
        files: spanSummary.files,
        finishedAt: input.finishedAt,
        inputTokens: 0,
        iteration: input.promptSequence,
        kind: input.kind,
        model: input.modelId,
        outputTokens: 0,
        phase: 'interactive',
        provider: input.provider,
        requestId,
        role: 'editor',
        runId: input.sessionId,
        sessionId: input.sessionId,
        source: 'semanticode-interactive',
        spanCount: spanSummary.spanCount,
        spanSource: 'tool_hooks',
        startedAt: input.startedAt,
        task: input.scope?.task ?? summarizePrompt(input.message),
        textBytes: spanSummary.textBytes,
        textChars: spanSummary.textChars,
        timestamp: input.finishedAt,
        toolNames: spanSummary.toolNames,
        totalTokens: 0,
        usageSource: 'unavailable',
      },
      spans: spanRecords,
    })
  }

  async getRunAnalytics(rootDir: string, runId: string) {
    const requestTelemetry = await readRequestTelemetryRecords({
      cwd: rootDir,
    })
    const telemetry = await readRunTelemetryEvents(rootDir, runId)

    return deriveRequestTelemetryAnalytics({
      requests: requestTelemetry.requests,
      runId,
      telemetry,
    })
  }

  async getRunTokenSummary(rootDir: string, runId: string) {
    const paths = await resolvePiHarnessPaths(rootDir)
    const runPaths = getPiRunScopedPaths(paths, runId)

    return readTokenUsageSummary({
      tokenUsageEventsFile: runPaths.tokenUsageEventsFile,
      tokenUsageSummaryFile: runPaths.tokenUsageSummaryFile,
    })
  }

  async getTelemetryOverview(input: {
    mode: TelemetryMode
    rootDir: string
    runId?: string
    source: TelemetrySource
    window: TelemetryWindow
  }): Promise<TelemetryOverview> {
    const telemetry = await this.readFilteredTelemetry(input)
    const breakdown = deriveRequestTelemetryBreakdown({
      requests: telemetry.requests,
      spans: telemetry.spans,
    })

    return {
      activeRuns: [],
      requestCount: breakdown.source.requestCount,
      source: input.source,
      topDirectories: mapBreakdownBuckets(breakdown.breakdowns.byDirectory),
      topFiles: mapBreakdownBuckets(breakdown.breakdowns.byFile),
      topTools: mapBreakdownBuckets(breakdown.breakdowns.byTool),
      totalTokens: breakdown.totals.totalTokens,
      window: input.window,
    }
  }

  async getTelemetryActivity(input: {
    mode: TelemetryMode
    rootDir: string
    runId?: string
    source: TelemetrySource
    window: TelemetryWindow
  }): Promise<TelemetryActivityEvent[]> {
    const telemetry = await this.readFilteredTelemetry(input)
    const spansByRequestId = indexSpansByRequestId(telemetry.spans)
    const events: TelemetryActivityEvent[] = []

    for (const request of telemetry.requests) {
      const requestPaths = collectRequestPaths(request, spansByRequestId.get(String(request.requestId ?? '')) ?? [])
      const totalTokens = getAttributionBudget(request)
      const confidence = getRequestConfidence(request)

      if (requestPaths.length === 0) {
        continue
      }

      for (const pathValue of requestPaths) {
        events.push({
          confidence,
          key: `${String(request.requestId ?? '')}:${pathValue}`,
          path: pathValue,
          requestCount: 1,
          runId: String(request.runId ?? ''),
          sessionId: String(request.sessionId ?? ''),
          source: getTelemetrySourceForRequest(request),
          timestamp: String(request.timestamp ?? ''),
          toolNames: Array.isArray(request.toolNames)
            ? request.toolNames
                .map((toolName: unknown) => String(toolName))
                .filter(Boolean)
            : [],
          totalTokens,
        })
      }
    }

    return events
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 80)
  }

  async getTelemetryHeatmap(input: {
    mode: TelemetryMode
    rootDir: string
    runId?: string
    source: TelemetrySource
    window: TelemetryWindow
  }): Promise<AgentHeatSample[]> {
    const [telemetry, snapshot] = await Promise.all([
      this.readFilteredTelemetry(input),
      readProjectSnapshot({
        analyzeCalls: true,
        analyzeImports: true,
        analyzeSymbols: true,
        rootDir: input.rootDir,
      }),
    ])
    const spansByRequestId = indexSpansByRequestId(telemetry.spans)
    const filesByPath = new Map<string, string>()
    const symbolsByFileId = new Map<string, string[]>()

    for (const node of Object.values(snapshot.nodes)) {
      if (isFileNode(node)) {
        filesByPath.set(node.path, node.id)
        continue
      }

      if (isSymbolNode(node)) {
        const existing = symbolsByFileId.get(node.fileId) ?? []
        existing.push(node.id)
        symbolsByFileId.set(node.fileId, existing)
      }
    }

    const byPath = new Map<string, {
      confidence: TelemetryConfidence
      lastSeenAt: string
      requestCount: number
      source: TelemetrySource
      totalTokens: number
    }>()

    for (const request of telemetry.requests) {
      const requestPaths = collectRequestPaths(
        request,
        spansByRequestId.get(String(request.requestId ?? '')) ?? [],
      )
      const attributionBudget = getAttributionBudget(request)
      const perPathBudget = requestPaths.length > 0 ? attributionBudget / requestPaths.length : 0
      const source = getTelemetrySourceForRequest(request)
      const confidence = getRequestConfidence(request)

      for (const pathValue of requestPaths) {
        const current = byPath.get(pathValue) ?? {
          confidence,
          lastSeenAt: String(request.timestamp ?? ''),
          requestCount: 0,
          source,
          totalTokens: 0,
        }

        current.requestCount += 1
        current.totalTokens += perPathBudget
        current.lastSeenAt =
          current.lastSeenAt > String(request.timestamp ?? '')
            ? current.lastSeenAt
            : String(request.timestamp ?? '')
        current.confidence = mergeConfidence(current.confidence, confidence)
        current.source =
          current.source === source ? source : 'all'
        byPath.set(pathValue, current)
      }
    }

    const samples = [...byPath.entries()]
      .map(([pathValue, value]) => {
        const fileNodeId = filesByPath.get(pathValue)

        if (!fileNodeId) {
          return null
        }

        const nodeIds =
          input.mode === 'symbols'
            ? (symbolsByFileId.get(fileNodeId) ?? [])
            : [fileNodeId]

        if (nodeIds.length === 0) {
          return null
        }

        return {
          confidence: value.confidence,
          lastSeenAt: value.lastSeenAt,
          nodeIds,
          path: pathValue,
          requestCount: value.requestCount,
          source: value.source,
          totalTokens: roundMetric(value.totalTokens),
          weight: 0,
        } satisfies AgentHeatSample
      })
      .filter((sample): sample is AgentHeatSample => sample !== null)

    const maxScore = samples.reduce((maxValue, sample) => {
      return Math.max(maxValue, sample.totalTokens > 0 ? sample.totalTokens : sample.requestCount)
    }, 0)

    return samples
      .map((sample) => ({
        ...sample,
        weight:
          maxScore > 0
            ? roundMetric((sample.totalTokens > 0 ? sample.totalTokens : sample.requestCount) / maxScore)
            : 0,
      }))
      .sort((left, right) => right.weight - left.weight)
  }

  private async readFilteredTelemetry(input: {
    mode: TelemetryMode
    rootDir: string
    runId?: string
    source: TelemetrySource
    window: TelemetryWindow
  }) {
    const requestTelemetry = await readRequestTelemetryRecords({
      cwd: input.rootDir,
    })
    const requestIds = new Set<string>()
    const windowStart =
      typeof input.window === 'number'
        ? Date.now() - (input.window * 1000)
        : null

    const requests = requestTelemetry.requests.filter((request: Record<string, unknown>) => {
      const normalizedSource = getTelemetrySourceForRequest(request)

      if (input.source !== 'all' && normalizedSource !== input.source) {
        return false
      }

      if (input.window === 'run' && input.runId && String(request.runId ?? '') !== input.runId) {
        return false
      }

      if (windowStart !== null) {
        const timestampMs = new Date(String(request.timestamp ?? '')).getTime()

        if (!Number.isFinite(timestampMs) || timestampMs < windowStart) {
          return false
        }
      }

      requestIds.add(String(request.requestId ?? ''))
      return true
    })
    const spans = requestTelemetry.spans.filter((span: Record<string, unknown>) =>
      requestIds.has(String(span.requestId ?? '')),
    )

    return {
      requests,
      spans,
    }
  }
}

function buildInteractiveSpanRecords(input: {
  input: InteractiveTelemetryInput
  requestId: string
  sessionId: string
}) {
  const primaryPaths = getTelemetryScopePaths(input.input.scope)
  const promptPath = primaryPaths[0] ?? ''
  const promptText = input.input.message
  const promptByteCount = byteLength(promptText)
  const baseSpan = {
    messageIndex: 0,
    paths: primaryPaths,
    preview: promptText.slice(0, 280),
    primaryPath: promptPath,
    requestId: input.requestId,
    role: 'user',
    sessionId: input.sessionId,
    source: 'context',
    spanIndex: 0,
    spanKind: 'message',
    text: promptText,
    timestamp: input.input.startedAt,
    turnIndex: input.input.promptSequence,
  }
  const spans: SpanRecord[] = [
    {
      ...baseSpan,
      byteCount: promptByteCount,
      charCount: promptText.length,
    },
  ]

  input.input.toolInvocations.forEach((invocation, index) => {
    const toolPaths = deriveToolPaths(invocation.toolName, invocation.args)
    const argsText = safeJson(invocation.args)

    spans.push({
      byteCount: byteLength(argsText),
      charCount: argsText.length,
      paths: toolPaths,
      preview: argsText.slice(0, 280),
      primaryPath: toolPaths[0] ?? '',
      requestId: input.requestId,
      role: 'toolResult',
      sessionId: input.sessionId,
      source: 'tool_hooks',
      spanIndex: index + 1,
      spanKind: 'tool_call',
      text: argsText,
      timestamp: input.input.finishedAt,
      toolCallId: invocation.toolCallId,
      toolName: invocation.toolName,
      turnIndex: input.input.promptSequence,
    })
  })

  return spans
}

function collectRequestPaths(
  request: RequestRecord,
  spans: SpanRecord[],
) {
  const pathSet = new Set<string>()

  for (const span of spans) {
    for (const pathValue of Array.isArray(span.paths) ? span.paths : []) {
      pathSet.add(String(pathValue))
    }
  }

  if (pathSet.size === 0) {
    for (const pathValue of Array.isArray(request.files) ? request.files : []) {
      pathSet.add(String(pathValue))
    }
  }

  return [...pathSet].filter(Boolean)
}

function getTelemetrySourceForRequest(request: RequestRecord): TelemetrySource {
  return request.source === 'semanticode-interactive' ? 'interactive' : 'autonomous'
}

function getRequestConfidence(request: RequestRecord): TelemetryConfidence {
  if (request.source === 'semanticode-interactive') {
    return 'fallback'
  }

  if (
    request.usageSource &&
    request.usageSource !== 'unavailable' &&
    getAttributionBudget(request) > 0
  ) {
    return 'exact'
  }

  return 'attributed'
}

function mergeConfidence(
  left: TelemetryConfidence,
  right: TelemetryConfidence,
): TelemetryConfidence {
  const rank: Record<TelemetryConfidence, number> = {
    exact: 3,
    attributed: 2,
    fallback: 1,
  }

  return rank[left] >= rank[right] ? left : right
}

function indexSpansByRequestId(spans: SpanRecord[]) {
  const result = new Map<string, SpanRecord[]>()

  for (const span of spans) {
    const requestId = String(span.requestId ?? '')

    if (!requestId) {
      continue
    }

    const existing = result.get(requestId) ?? []
    existing.push(span)
    result.set(requestId, existing)
  }

  return result
}

function mapBreakdownBuckets(
  buckets: Array<{
    key: string
    label: string
    requestCount?: number
    totalTokens?: number
  }>,
): TelemetryOverviewBucket[] {
  return buckets.slice(0, 8).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    requestCount: Number(bucket.requestCount ?? 0),
    totalTokens: roundMetric(Number(bucket.totalTokens ?? 0)),
  }))
}

function getAttributionBudget(request: RequestRecord) {
  return roundMetric(
    Number(request.totalTokens ?? 0) > 0
      ? Number(request.totalTokens ?? 0)
      : Number(request.inputTokens ?? 0) +
          Number(request.cacheReadTokens ?? 0) +
          Number(request.cacheWriteTokens ?? 0),
  )
}

function getTelemetryScopePaths(
  scope: InteractiveTelemetryScopeShape | { paths: string[]; symbolPaths?: string[] } | undefined,
) {
  const pathSet = new Set<string>()

  for (const pathValue of scope?.paths ?? []) {
    pathSet.add(normalizeRelativePath(pathValue))
  }

  if (scope && 'scope' in scope && scope.scope) {
    for (const pathValue of scope.scope.paths ?? []) {
      pathSet.add(normalizeRelativePath(pathValue))
    }
  }

  if (scope && 'symbolPaths' in scope) {
    for (const pathValue of scope.symbolPaths ?? []) {
      pathSet.add(normalizeRelativePath(pathValue))
    }
  }

  return [...pathSet].filter(Boolean)
}

async function readRunTelemetryEvents(rootDir: string, runId: string) {
  const paths = await resolvePiHarnessPaths(rootDir)
  const runPaths = getPiRunScopedPaths(paths, runId)

  try {
    const raw = await readFile(runPaths.telemetryJsonl, 'utf8')
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

function summarizePrompt(message: string) {
  return message
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function normalizeRelativePath(pathValue: string) {
  return pathValue.replace(/\\/g, '/').replace(/^\.\//, '').trim()
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

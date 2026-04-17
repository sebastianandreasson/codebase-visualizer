declare module '@sebastianandreasson/pi-autonomous-agents' {
  export interface RequestTelemetryPaths {
    rootDir: string
    hooksFile: string
    requestsFile: string
    spansFile: string
  }

  export interface RequestTelemetryBucket {
    key: string
    label: string
    requestCount?: number
    totalTokens?: number
  }

  export interface RequestTelemetryBreakdown {
    source: {
      requestCount: number
    }
    totals: {
      totalTokens: number
    }
    breakdowns: {
      byDirectory: RequestTelemetryBucket[]
      byFile: RequestTelemetryBucket[]
      byTool: RequestTelemetryBucket[]
    }
  }

  export interface RequestTelemetryAnalyticsTimelinePoint {
    key: string
    timestamp: string
    label: string
    requestCount: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }

  export interface RequestTelemetryAnalyticsTodo {
    key: string
    iteration: number
    phase: string
    task: string
    status: string
    requestCount: number
    firstTimestamp: string
    lastTimestamp: string
    roles: string[]
    kinds: string[]
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }

  export interface RequestTelemetryAnalytics {
    source: {
      requestCount: number
      runId?: string
      sessionId?: string
    }
    timeline: RequestTelemetryAnalyticsTimelinePoint[]
    todos: RequestTelemetryAnalyticsTodo[]
  }

  export interface TokenUsageSummary {
    totals: {
      totalTokens: number
    }
  }

  export interface RequestSpansSummary {
    files: string[]
    spanCount: number
    textBytes: number
    textChars: number
    toolNames: string[]
  }

  export function getRequestTelemetryPaths(input: {
    cwd: string
    baseDir?: string
  }): RequestTelemetryPaths

  export function ensureBundledRequestTelemetryExtension(input: {
    cwd: string
    enabled?: boolean
  }): Promise<unknown>

  export function appendRequestTelemetryArtifacts(
    paths: RequestTelemetryPaths,
    artifacts: {
      request: Record<string, unknown>
      spans?: Record<string, unknown>[]
    },
    options?: {
      includeSpanPreview?: boolean
      includeSpanText?: boolean
    },
  ): Promise<{
    request: Record<string, unknown>
    spans: Record<string, unknown>[]
  }>

  export function readRequestTelemetryRecords(input: {
    cwd: string
    baseDir?: string
  }): Promise<{
    requests: Record<string, unknown>[]
    spans: Record<string, unknown>[]
  }>

  export function deriveRequestTelemetryBreakdown(input: {
    requests?: Record<string, unknown>[]
    spans?: Record<string, unknown>[]
    runId?: string
    sessionId?: string
  }): RequestTelemetryBreakdown

  export function deriveRequestTelemetryAnalytics(input: {
    requests?: Record<string, unknown>[]
    telemetry?: Record<string, unknown>[]
    runId?: string
    sessionId?: string
  }): RequestTelemetryAnalytics

  export function readTokenUsageSummary(input: {
    tokenUsageEventsFile?: string
    tokenUsageSummaryFile?: string
  }): Promise<TokenUsageSummary>

  export function summarizeRequestSpans(
    spans?: Record<string, unknown>[],
  ): RequestSpansSummary

  export function deriveToolPaths(toolName: string, value: unknown): string[]
}

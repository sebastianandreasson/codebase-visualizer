import { describe, expect, it } from 'vitest'

import { buildAgentDebugFeedEntries } from './useAgentEventFeed'
import type { FollowDebugState } from '../types'

describe('buildAgentDebugFeedEntries', () => {
  it('surfaces symbol attribution for telemetry and file operation rows', () => {
    const entries = buildAgentDebugFeedEntries({
      agentEvents: [],
      dirtyFileEditSignals: [],
      fileOperations: [
        {
          confidence: 'exact',
          id: 'operation-1',
          kind: 'file_write',
          path: 'src/app.ts',
          paths: ['src/app.ts'],
          sessionId: 'session-1',
          source: 'pi-sdk',
          status: 'completed',
          symbolNodeIds: ['symbol:src/app.ts:useApp'],
          timestamp: '2026-04-18T10:00:01.000Z',
          toolCallId: 'call-1',
          toolName: 'replaceSymbolRange',
        },
      ],
      followDebugState: createIdleFollowDebugState(),
      telemetryActivityEvents: [
        {
          confidence: 'exact',
          key: 'request-1:src/app.ts',
          path: 'src/app.ts',
          requestCount: 1,
          runId: 'run-1',
          sessionId: 'session-1',
          source: 'autonomous',
          symbolNodeIds: ['symbol:src/app.ts:useApp'],
          timestamp: '2026-04-18T10:00:02.000Z',
          toolNames: ['readSymbolSlice'],
          totalTokens: 42,
        },
      ],
    })

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining('1 symbol'),
          source: 'file-operation',
          symbolNodeIds: ['symbol:src/app.ts:useApp'],
        }),
        expect.objectContaining({
          detail: expect.stringContaining('exact'),
          source: 'telemetry',
          symbolNodeIds: ['symbol:src/app.ts:useApp'],
        }),
      ]),
    )
  })
})

function createIdleFollowDebugState(): FollowDebugState {
  return {
    cameraLockActive: false,
    cameraLockUntilMs: 0,
    currentMode: 'idle',
    currentTarget: null,
    latestEvent: null,
    queueLength: 0,
    refreshInFlight: false,
    refreshPending: false,
  }
}

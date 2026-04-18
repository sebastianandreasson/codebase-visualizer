import { describe, expect, it } from 'vitest'

import {
  computePendingEditedPaths,
  createInitialFollowControllerState,
  followControllerReducer,
  getPreferredFollowSymbolIdsForFile,
} from './agentFollowModel'
import type { ProjectSnapshot, TelemetryActivityEvent } from '../types'

describe('agentFollowModel', () => {
  it('prefers edit targets over generic activity targets', () => {
    const snapshot = createSnapshot()
    const state = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 1_000 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 1_010, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 1_020,
        snapshot,
        visibleNodeIds: ['symbol:createPRNG', 'symbol:getSpawnCell'],
      },
      {
        type: 'TELEMETRY_BATCH_UPDATED',
        nowMs: 1_030,
        telemetryEnabled: true,
        telemetryActivityEvents: [
          createTelemetryEvent({
            key: 'activity:spawn',
            path: 'game.js',
            timestamp: '2026-04-18T10:00:03.000Z',
            toolNames: ['read_file'],
          }),
          createTelemetryEvent({
            key: 'edit:debug',
            path: 'debug_brute.js',
            timestamp: '2026-04-18T10:00:02.000Z',
            toolNames: ['write_file'],
          }),
        ],
      },
    ])

    expect(state.debug.currentMode).toBe('edit')
    expect(state.currentCameraCommand?.target.path).toBe('debug_brute.js')
    expect(state.currentInspectorCommand?.target.path).toBe('debug_brute.js')
  })

  it('adds newly dirty files to the queue in telemetry order and prunes cleared ones', () => {
    const telemetryActivityEvents = [
      createTelemetryEvent({
        key: 'touch:c',
        path: 'src/c.ts',
        timestamp: '2026-04-18T10:00:03.000Z',
        toolNames: ['read_file'],
      }),
      createTelemetryEvent({
        key: 'touch:b',
        path: 'src/b.ts',
        timestamp: '2026-04-18T10:00:02.000Z',
        toolNames: ['read_file'],
      }),
    ]

    const nextPendingPaths = computePendingEditedPaths({
      currentPendingPaths: ['src/a.ts'],
      liveChangedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      previousChangedPaths: new Set(['src/a.ts']),
      reprioritizedPaths: [],
      telemetryActivityEvents,
    })

    expect(nextPendingPaths).toEqual(['src/c.ts', 'src/b.ts', 'src/a.ts'])

    const prunedPendingPaths = computePendingEditedPaths({
      currentPendingPaths: nextPendingPaths,
      liveChangedFiles: ['src/c.ts'],
      previousChangedPaths: new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']),
      reprioritizedPaths: [],
      telemetryActivityEvents,
    })

    expect(prunedPendingPaths).toEqual(['src/c.ts'])
  })

  it('creates a dirty-file fallback edit target when telemetry is late', () => {
    const snapshot = createSnapshot({
      includeDebugNamedSymbol: false,
      includeDebugAnonSymbol: false,
    })
    const state = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 2_000 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 2_010, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 2_020,
        snapshot,
        visibleNodeIds: ['symbol:getSpawnCell'],
      },
      {
        type: 'DIRTY_FILES_UPDATED',
        liveChangedFiles: ['debug_brute.js'],
        nowMs: 2_030,
      },
    ])

    expect(state.latestResolvedEditTarget).toEqual(
      expect.objectContaining({
        confidence: 'dirty_file_fallback',
        eventKey: 'dirty:debug_brute.js',
        kind: 'file',
        path: 'debug_brute.js',
      }),
    )
    expect(state.currentInspectorCommand?.target.kind).toBe('file')
    expect(state.currentRefreshCommand?.target.kind).toBe('file')
  })

  it('upgrades a file-level dirty fallback to a symbol target after snapshot refresh', () => {
    const initialSnapshot = createSnapshot({
      includeDebugNamedSymbol: false,
      includeDebugAnonSymbol: false,
    })
    const upgradedSnapshot = createSnapshot({
      includeDebugNamedSymbol: true,
      includeDebugAnonSymbol: false,
    })
    const initialState = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 3_000 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 3_010, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 3_020,
        snapshot: initialSnapshot,
        visibleNodeIds: ['symbol:getSpawnCell'],
      },
      {
        type: 'DIRTY_FILES_UPDATED',
        liveChangedFiles: ['debug_brute.js'],
        nowMs: 3_030,
      },
    ])

    expect(initialState.latestResolvedEditTarget?.kind).toBe('file')

    const upgradedState = followControllerReducer(initialState, {
      type: 'SNAPSHOT_CONTEXT_UPDATED',
      nowMs: 3_040,
      snapshot: upgradedSnapshot,
      visibleNodeIds: ['symbol:createPRNG', 'symbol:getSpawnCell'],
    })

    expect(upgradedState.latestResolvedEditTarget).toEqual(
      expect.objectContaining({
        confidence: 'exact_symbol',
        eventKey: initialState.latestResolvedEditTarget?.eventKey,
        kind: 'symbol',
        primaryNodeId: 'symbol:createPRNG',
      }),
    )
  })

  it('deprioritizes synthetic anon symbols when a named symbol is available', () => {
    const snapshot = createSnapshot()
    const symbolIdsByFileId = new Map<string, string[]>([
      ['file:debug', ['symbol:anon', 'symbol:createPRNG']],
    ])

    expect(
      getPreferredFollowSymbolIdsForFile({
        fileId: 'file:debug',
        snapshot,
        symbolIdsByFileId,
      }),
    ).toEqual(['symbol:createPRNG'])
  })

  it('does not re-emit a camera command after acknowledgement until a newer event arrives', () => {
    const snapshot = createSnapshot()
    const initialState = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 4_000 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 4_010, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 4_020,
        snapshot,
        visibleNodeIds: ['symbol:createPRNG', 'symbol:getSpawnCell'],
      },
      {
        type: 'TELEMETRY_BATCH_UPDATED',
        nowMs: 4_030,
        telemetryEnabled: true,
        telemetryActivityEvents: [
          createTelemetryEvent({
            key: 'activity:debug:1',
            path: 'debug_brute.js',
            timestamp: '2026-04-18T10:00:01.000Z',
            toolNames: ['read_file'],
          }),
        ],
      },
    ])

    const firstCommandId = initialState.currentCameraCommand?.id
    expect(firstCommandId).toBeTruthy()

    const acknowledgedState = followControllerReducer(initialState, {
      type: 'COMMAND_ACKNOWLEDGED',
      commandId: firstCommandId!,
      commandType: 'camera',
      intent: 'activity',
      nowMs: 4_040,
    })

    expect(acknowledgedState.currentCameraCommand).toBeNull()

    const unchangedState = followControllerReducer(acknowledgedState, {
      type: 'TELEMETRY_BATCH_UPDATED',
      nowMs: 4_050,
      telemetryEnabled: true,
      telemetryActivityEvents: [
        createTelemetryEvent({
          key: 'activity:debug:1',
          path: 'debug_brute.js',
          timestamp: '2026-04-18T10:00:01.000Z',
          toolNames: ['read_file'],
        }),
      ],
    })

    expect(unchangedState.currentCameraCommand).toBeNull()

    const updatedState = followControllerReducer(unchangedState, {
      type: 'TELEMETRY_BATCH_UPDATED',
      nowMs: 4_060,
      telemetryEnabled: true,
      telemetryActivityEvents: [
        createTelemetryEvent({
          key: 'activity:debug:2',
          path: 'debug_brute.js',
          timestamp: '2026-04-18T10:00:02.000Z',
          toolNames: ['read_file'],
        }),
      ],
    })

    expect(updatedState.currentCameraCommand?.id).not.toBe(firstCommandId)
    expect(updatedState.currentCameraCommand?.target.eventKey).toBe('activity:debug:2')
  })

  it('re-emits edit follow when an already-dirty file gets a new dirty signal fingerprint', () => {
    const snapshot = createSnapshot()
    const initialState = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 4_500 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 4_510, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 4_520,
        snapshot,
        visibleNodeIds: ['symbol:createPRNG', 'symbol:getSpawnCell'],
      },
      {
        type: 'DIRTY_FILES_UPDATED',
        liveChangedFiles: ['debug_brute.js'],
        nowMs: 4_530,
      },
      {
        type: 'DIRTY_FILE_SIGNALS_UPDATED',
        nowMs: 4_540,
        signals: [
          {
            changedAt: '2026-04-18T10:00:03.000Z',
            changedAtMs: 1_000,
            fingerprint: 'diff:1',
            path: 'debug_brute.js',
          },
        ],
      },
    ])

    const firstInspectorCommandId = initialState.currentInspectorCommand?.id
    expect(firstInspectorCommandId).toBeTruthy()

    const acknowledgedState = reduceFollowState(
      [
        {
          type: 'COMMAND_ACKNOWLEDGED',
          commandId: initialState.currentCameraCommand!.id,
          commandType: 'camera',
          intent: 'edit',
          nowMs: 4_550,
        },
        {
          type: 'COMMAND_ACKNOWLEDGED',
          commandId: initialState.currentInspectorCommand!.id,
          commandType: 'inspector',
          nowMs: 4_560,
          pendingPath: initialState.currentInspectorCommand?.pendingPath ?? null,
        },
      ],
      initialState,
    )

    expect(acknowledgedState.currentInspectorCommand).toBeNull()

    const updatedState = followControllerReducer(acknowledgedState, {
      type: 'DIRTY_FILE_SIGNALS_UPDATED',
      nowMs: 4_570,
      signals: [
        {
          changedAt: '2026-04-18T10:00:04.000Z',
          changedAtMs: 2_000,
          fingerprint: 'diff:2',
          path: 'debug_brute.js',
        },
      ],
    })

    expect(updatedState.pendingDirtyPaths[0]).toBe('debug_brute.js')
    expect(updatedState.currentInspectorCommand?.id).not.toBe(firstInspectorCommandId)
    expect(updatedState.currentInspectorCommand?.target.eventKey).toBe(
      'dirty:debug_brute.js:diff:2',
    )
  })

  it('suppresses lower-priority activity follow while the edit camera lock is active', () => {
    const snapshot = createSnapshot()
    const editState = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 5_000 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 5_010, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 5_020,
        snapshot,
        visibleNodeIds: ['symbol:createPRNG', 'symbol:getSpawnCell'],
      },
      {
        type: 'DIRTY_FILES_UPDATED',
        liveChangedFiles: ['debug_brute.js'],
        nowMs: 5_030,
      },
    ])

    expect(editState.currentCameraCommand?.target.intent).toBe('edit')

    const lockedState = followControllerReducer(editState, {
      type: 'COMMAND_ACKNOWLEDGED',
      commandId: editState.currentCameraCommand!.id,
      commandType: 'camera',
      intent: 'edit',
      nowMs: 5_040,
    })

    const activityDuringLockState = reduceFollowState(
      [
        {
          type: 'DIRTY_FILES_UPDATED',
          liveChangedFiles: [],
          nowMs: 5_050,
        },
        {
          type: 'TELEMETRY_BATCH_UPDATED',
          nowMs: 5_060,
          telemetryEnabled: true,
          telemetryActivityEvents: [
            createTelemetryEvent({
              key: 'activity:spawn:1',
              path: 'game.js',
              timestamp: '2026-04-18T10:00:03.000Z',
              toolNames: ['read_file'],
            }),
          ],
        },
      ],
      lockedState,
    )

    expect(activityDuringLockState.currentCameraCommand).toBeNull()

    const unlockedState = followControllerReducer(activityDuringLockState, {
      type: 'CLOCK_TICKED',
      nowMs: lockedState.cameraLockUntilMs + 1,
    })

    expect(unlockedState.currentCameraCommand?.target.path).toBe('game.js')
    expect(unlockedState.currentCameraCommand?.target.intent).toBe('activity')
  })

  it('resets pending commands and queue state when follow is disabled', () => {
    const snapshot = createSnapshot()
    const activeState = reduceFollowState([
      { type: 'FOLLOW_TOGGLED', enabled: true, nowMs: 6_000 },
      { type: 'VIEW_MODE_CHANGED', mode: 'symbols', nowMs: 6_010, viewMode: 'symbols' },
      {
        type: 'SNAPSHOT_CONTEXT_UPDATED',
        nowMs: 6_020,
        snapshot,
        visibleNodeIds: ['symbol:createPRNG', 'symbol:getSpawnCell'],
      },
      {
        type: 'DIRTY_FILES_UPDATED',
        liveChangedFiles: ['debug_brute.js'],
        nowMs: 6_030,
      },
    ])

    const disabledState = followControllerReducer(activeState, {
      type: 'FOLLOW_TOGGLED',
      enabled: false,
      nowMs: 6_040,
    })

    expect(disabledState.currentCameraCommand).toBeNull()
    expect(disabledState.currentInspectorCommand).toBeNull()
    expect(disabledState.currentRefreshCommand).toBeNull()
    expect(disabledState.pendingDirtyPaths).toEqual([])
    expect(disabledState.debug.currentMode).toBe('idle')
  })
})

function reduceFollowState(
  actions: Parameters<typeof followControllerReducer>[1][],
  initialState = createInitialFollowControllerState(),
) {
  return actions.reduce(
    (state, action) => followControllerReducer(state, action),
    initialState,
  )
}

function createTelemetryEvent(
  overrides: Partial<TelemetryActivityEvent> & Pick<TelemetryActivityEvent, 'key' | 'path'>,
): TelemetryActivityEvent {
  return {
    confidence: 'attributed',
    key: overrides.key,
    path: overrides.path,
    requestCount: overrides.requestCount ?? 1,
    runId: overrides.runId ?? 'run:test',
    sessionId: overrides.sessionId ?? 'session:test',
    source: overrides.source ?? 'autonomous',
    timestamp: overrides.timestamp ?? '2026-04-18T10:00:00.000Z',
    toolNames: overrides.toolNames ?? [],
    totalTokens: overrides.totalTokens ?? 100,
  }
}

function createSnapshot(input?: {
  includeDebugAnonSymbol?: boolean
  includeDebugNamedSymbol?: boolean
  includeGameSymbol?: boolean
}): ProjectSnapshot {
  const includeDebugAnonSymbol = input?.includeDebugAnonSymbol ?? true
  const includeDebugNamedSymbol = input?.includeDebugNamedSymbol ?? true
  const includeGameSymbol = input?.includeGameSymbol ?? true
  const nodes: ProjectSnapshot['nodes'] = {
    'file:debug': {
      kind: 'file',
      id: 'file:debug',
      name: 'debug_brute.js',
      path: 'debug_brute.js',
      tags: [],
      parentId: null,
      language: 'javascript',
      extension: '.js',
      size: 120,
      content: '',
    },
    'file:game': {
      kind: 'file',
      id: 'file:game',
      name: 'game.js',
      path: 'game.js',
      tags: [],
      parentId: null,
      language: 'javascript',
      extension: '.js',
      size: 240,
      content: '',
    },
  }

  if (includeDebugAnonSymbol) {
    nodes['symbol:anon'] = {
      kind: 'symbol',
      id: 'symbol:anon',
      name: 'anon',
      path: 'debug_brute.js#anon@2:19',
      tags: [],
      fileId: 'file:debug',
      parentSymbolId: null,
      language: 'javascript',
      symbolKind: 'function',
      range: {
        start: { line: 2, column: 19 },
        end: { line: 6, column: 2 },
      },
    }
  }

  if (includeDebugNamedSymbol) {
    nodes['symbol:createPRNG'] = {
      kind: 'symbol',
      id: 'symbol:createPRNG',
      name: 'createPRNG',
      path: 'debug_brute.js#createPRNG',
      tags: [],
      fileId: 'file:debug',
      parentSymbolId: null,
      language: 'javascript',
      symbolKind: 'function',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 8, column: 2 },
      },
    }
  }

  if (includeGameSymbol) {
    nodes['symbol:getSpawnCell'] = {
      kind: 'symbol',
      id: 'symbol:getSpawnCell',
      name: 'getSpawnCell',
      path: 'game.js#getSpawnCell',
      tags: [],
      fileId: 'file:game',
      parentSymbolId: null,
      language: 'javascript',
      symbolKind: 'function',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 12, column: 2 },
      },
    }
  }

  return {
    schemaVersion: 1,
    rootDir: '/tmp/workspace',
    generatedAt: '2026-04-18T10:00:00.000Z',
    totalFiles: 2,
    rootIds: ['file:debug', 'file:game'],
    entryFileIds: ['file:debug', 'file:game'],
    nodes,
    edges: [],
    tags: [],
  }
}

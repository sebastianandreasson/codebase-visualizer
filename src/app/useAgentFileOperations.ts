import { useEffect, useMemo, useReducer } from 'react'

import { DesktopAgentClient } from '../agent/DesktopAgentClient'
import type { AgentFileOperation } from '../types'

const MAX_LIVE_FILE_OPERATIONS = 250
const POLLED_FILE_OPERATIONS_INTERVAL_MS = 1000
const GENERATION_LOOKBACK_MS = 5000

interface OperationState {
  enabledSinceMs: number | null
  operations: AgentFileOperation[]
}

type OperationAction =
  | {
      enabled: boolean
      nowMs: number
      type: 'ENABLED_CHANGED'
    }
  | {
      operation: AgentFileOperation
      type: 'OPERATION_RECEIVED'
    }
  | {
      operations: AgentFileOperation[]
      type: 'OPERATIONS_RECEIVED'
    }

export function useAgentFileOperations(input: {
  enabled: boolean
}) {
  const agentClient = useMemo(() => new DesktopAgentClient(), [])
  const [state, dispatch] = useReducer(operationReducer, {
    enabledSinceMs: null,
    operations: [],
  })

  useEffect(() => {
    dispatch({
      enabled: input.enabled,
      nowMs: Date.now(),
      type: 'ENABLED_CHANGED',
    })
  }, [input.enabled])

  useEffect(() => {
    if (!input.enabled) {
      return
    }

    return agentClient.subscribe((event) => {
      if (event.type !== 'file_operation') {
        return
      }

      dispatch({
        operation: event.operation,
        type: 'OPERATION_RECEIVED',
      })
    })
  }, [agentClient, input.enabled])

  useEffect(() => {
    if (!input.enabled) {
      return
    }

    let cancelled = false

    const refreshOperations = async () => {
      try {
        const agentState = await agentClient.getHttpState()

        if (cancelled) {
          return
        }

        dispatch({
          operations: agentState.fileOperations ?? [],
          type: 'OPERATIONS_RECEIVED',
        })
      } catch {
        // Live bridge events are still the primary source when HTTP polling fails.
      }
    }

    void refreshOperations()
    const intervalId = window.setInterval(() => {
      void refreshOperations()
    }, POLLED_FILE_OPERATIONS_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [agentClient, input.enabled])

  return useMemo(() => {
    if (!input.enabled) {
      return []
    }

    if (state.enabledSinceMs === null) {
      return []
    }

    return state.operations
  }, [input.enabled, state.enabledSinceMs, state.operations])
}

function operationReducer(
  state: OperationState,
  action: OperationAction,
): OperationState {
  switch (action.type) {
    case 'ENABLED_CHANGED': {
      if (!action.enabled) {
        return {
          enabledSinceMs: null,
          operations: [],
        }
      }

      if (state.enabledSinceMs !== null) {
        return state
      }

      return {
        enabledSinceMs: action.nowMs,
        operations: [],
      }
    }

    case 'OPERATION_RECEIVED': {
      if (state.enabledSinceMs === null) {
        return state
      }

      return {
        ...state,
        operations: upsertOperation(state.operations, action.operation),
      }
    }

    case 'OPERATIONS_RECEIVED': {
      if (state.enabledSinceMs === null) {
        return state
      }

      const nextOperations = action.operations
        .filter((operation) => isOperationInActiveWindow(state, operation))
        .reduce(upsertOperation, state.operations)

      return {
        ...state,
        operations: nextOperations,
      }
    }
  }
}

function isOperationInActiveWindow(
  state: OperationState,
  operation: AgentFileOperation,
) {
  if (state.enabledSinceMs === null) {
    return true
  }

  const timestampMs = new Date(operation.timestamp).getTime()
  if (!Number.isFinite(timestampMs)) {
    return true
  }

  return timestampMs >= state.enabledSinceMs - GENERATION_LOOKBACK_MS
}

function upsertOperation(
  previousOperations: AgentFileOperation[],
  operation: AgentFileOperation,
) {
  const existingIndex = previousOperations.findIndex(
    (previousOperation) => previousOperation.id === operation.id,
  )
  const nextOperations =
    existingIndex === -1
      ? [operation, ...previousOperations]
      : previousOperations.map((previousOperation, index) =>
          index === existingIndex ? operation : previousOperation,
        )

  return nextOperations
    .sort(compareOperationsDescending)
    .slice(0, MAX_LIVE_FILE_OPERATIONS)
}

function compareOperationsDescending(
  left: AgentFileOperation,
  right: AgentFileOperation,
) {
  const leftTimestampMs = new Date(left.timestamp).getTime()
  const rightTimestampMs = new Date(right.timestamp).getTime()

  if (Number.isFinite(leftTimestampMs) && Number.isFinite(rightTimestampMs)) {
    return rightTimestampMs - leftTimestampMs
  }

  return right.id.localeCompare(left.id)
}

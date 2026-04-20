import { useEffect, useState } from 'react'

import type { WorkspaceUiState } from '../types'

interface UseWorkspaceViewStateInput {
  activeDraftId: string | null
  activeLayoutId: string | null
  initialWorkspaceStateByRootDir: Record<string, WorkspaceUiState>
  rootDir: string | null | undefined
  uiPreferencesHydrated: boolean
}

export function useWorkspaceViewState({
  activeDraftId,
  activeLayoutId,
  initialWorkspaceStateByRootDir,
  rootDir,
  uiPreferencesHydrated,
}: UseWorkspaceViewStateInput) {
  const [workspaceViewResolvedRootDir, setWorkspaceViewResolvedRootDir] = useState<
    string | null
  >(null)
  const [workspaceStateByRootDir, setWorkspaceStateByRootDir] = useState<
    Record<string, WorkspaceUiState>
  >(initialWorkspaceStateByRootDir)

  useEffect(() => {
    if (!rootDir) {
      return
    }

    if (!uiPreferencesHydrated || workspaceViewResolvedRootDir !== rootDir) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setWorkspaceStateByRootDir((currentState) => {
        const currentEntry = currentState[rootDir]
        const nextEntry: WorkspaceUiState = {
          activeDraftId: activeDraftId ?? undefined,
          activeLayoutId: activeDraftId ? undefined : activeLayoutId ?? undefined,
        }

        if (
          currentEntry?.activeDraftId === nextEntry.activeDraftId &&
          currentEntry?.activeLayoutId === nextEntry.activeLayoutId
        ) {
          return currentState
        }

        return {
          ...currentState,
          [rootDir]: nextEntry,
        }
      })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    activeDraftId,
    activeLayoutId,
    rootDir,
    uiPreferencesHydrated,
    workspaceViewResolvedRootDir,
  ])

  return {
    setWorkspaceStateByRootDir,
    setWorkspaceViewResolvedRootDir,
    workspaceStateByRootDir,
    workspaceViewResolvedRootDir,
  }
}

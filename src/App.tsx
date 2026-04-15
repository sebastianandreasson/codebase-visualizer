import { startTransition, useEffect, useState } from 'react'

import { CodebaseVisualizer } from './index'
import type {
  AgentStateResponse,
  CodebaseSnapshot,
  DraftMutationResponse,
  LayoutStateResponse,
} from './types'
import { useVisualizerStore } from './store/visualizerStore'
import {
  CODEBASE_VISUALIZER_AGENT_MESSAGE_ROUTE,
  CODEBASE_VISUALIZER_AGENT_SESSION_ROUTE,
  buildCodebaseVisualizerDraftActionRoute,
  CODEBASE_VISUALIZER_LAYOUTS_ROUTE,
  CODEBASE_VISUALIZER_ROUTE,
} from './shared/constants'

export default function App() {
  const [layoutActionPending, setLayoutActionPending] = useState(false)
  const [layoutSuggestionPending, setLayoutSuggestionPending] = useState(false)
  const [layoutSuggestionError, setLayoutSuggestionError] = useState<string | null>(null)
  const status = useVisualizerStore((state) => state.status)
  const errorMessage = useVisualizerStore((state) => state.errorMessage)
  const activeDraftId = useVisualizerStore((state) => state.activeDraftId)
  const snapshot = useVisualizerStore((state) => state.snapshot)
  const draftLayouts = useVisualizerStore((state) => state.draftLayouts)
  const setErrorMessage = useVisualizerStore((state) => state.setErrorMessage)
  const setActiveDraftId = useVisualizerStore((state) => state.setActiveDraftId)
  const setActiveLayoutId = useVisualizerStore((state) => state.setActiveLayoutId)
  const setDraftLayouts = useVisualizerStore((state) => state.setDraftLayouts)
  const setLayouts = useVisualizerStore((state) => state.setLayouts)
  const setSnapshot = useVisualizerStore((state) => state.setSnapshot)
  const setStatus = useVisualizerStore((state) => state.setStatus)

  useEffect(() => {
    const desktopBridge = (
      globalThis as typeof globalThis & {
        codebaseVisualizerDesktop?: { isDesktop?: boolean }
      }
    ).codebaseVisualizerDesktop

    if (!desktopBridge?.isDesktop) {
      return
    }

    document.body.classList.add('is-desktop-host')

    return () => {
      document.body.classList.remove('is-desktop-host')
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadWorkspaceState() {
      setStatus('loading')

      try {
        const [snapshotResponse, layoutStateResponse] = await Promise.all([
          fetch(CODEBASE_VISUALIZER_ROUTE),
          fetch(CODEBASE_VISUALIZER_LAYOUTS_ROUTE),
        ])

        if (!snapshotResponse.ok) {
          throw new Error(await getResponseErrorMessage(
            snapshotResponse,
            `Snapshot request failed with status ${snapshotResponse.status}.`,
          ))
        }

        if (!layoutStateResponse.ok) {
          throw new Error(await getResponseErrorMessage(
            layoutStateResponse,
            `Layout state request failed with status ${layoutStateResponse.status}.`,
          ))
        }

        const [snapshot, layoutState] = (await Promise.all([
          snapshotResponse.json(),
          layoutStateResponse.json(),
        ])) as [CodebaseSnapshot, LayoutStateResponse]

        if (isCancelled) {
          return
        }

        startTransition(() => {
          setSnapshot(snapshot)
          setLayouts(layoutState.layouts)
          setDraftLayouts(layoutState.draftLayouts)
          setActiveLayoutId(layoutState.activeLayoutId)
          setActiveDraftId(layoutState.activeDraftId)
          setErrorMessage(null)
          setStatus('ready')
        })
      } catch (error) {
        if (isCancelled) {
          return
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load the codebase.',
        )
        setStatus('error')
      }
    }

    void loadWorkspaceState()

    return () => {
      isCancelled = true
    }
  }, [
    setActiveDraftId,
    setActiveLayoutId,
    setDraftLayouts,
    setErrorMessage,
    setLayouts,
    setSnapshot,
    setStatus,
  ])

  async function refreshLayoutState() {
    const response = await fetch(CODEBASE_VISUALIZER_LAYOUTS_ROUTE)

    if (!response.ok) {
      throw new Error(await getResponseErrorMessage(
        response,
        `Layout state request failed with status ${response.status}.`,
      ))
    }

    const layoutState = (await response.json()) as LayoutStateResponse

    startTransition(() => {
      setLayouts(layoutState.layouts)
      setDraftLayouts(layoutState.draftLayouts)
    })

    return layoutState
  }

  async function handleSuggestLayout(layoutBrief: string) {
    if (!snapshot?.rootDir) {
      setLayoutSuggestionError('The repository snapshot is not available yet.')
      return
    }

    const trimmedBrief = layoutBrief.trim()

    if (!trimmedBrief) {
      setLayoutSuggestionError('Enter a layout brief first.')
      return
    }

    setLayoutSuggestionPending(true)
    setLayoutSuggestionError(null)

    const existingDraftIds = new Set(draftLayouts.map((draft) => draft.id))

    try {
      const response = await fetch(CODEBASE_VISUALIZER_AGENT_MESSAGE_ROUTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: buildLayoutSuggestionPrompt(snapshot.rootDir, trimmedBrief),
        }),
      })

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(
          response,
          `Layout suggestion request failed with status ${response.status}.`,
        ))
      }

      const nextDraft = await waitForSuggestedLayoutDraft({
        existingDraftIds,
      })

      startTransition(() => {
        setActiveLayoutId(null)
        setActiveDraftId(nextDraft.id)
        setErrorMessage(null)
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate a layout draft.'
      setLayoutSuggestionError(message)
    } finally {
      setLayoutSuggestionPending(false)
    }
  }

  async function waitForSuggestedLayoutDraft(input: {
    existingDraftIds: Set<string>
  }) {
    const timeoutAt = Date.now() + 180_000

    while (Date.now() < timeoutAt) {
      const [layoutResponse, agentResponse] = await Promise.all([
        fetch(CODEBASE_VISUALIZER_LAYOUTS_ROUTE),
        fetch(CODEBASE_VISUALIZER_AGENT_SESSION_ROUTE),
      ])

      if (!layoutResponse.ok) {
        throw new Error(await getResponseErrorMessage(
          layoutResponse,
          `Layout state request failed with status ${layoutResponse.status}.`,
        ))
      }

      if (!agentResponse.ok) {
        throw new Error(await getResponseErrorMessage(
          agentResponse,
          `Agent session request failed with status ${agentResponse.status}.`,
        ))
      }

      const [layoutState, agentState] = (await Promise.all([
        layoutResponse.json(),
        agentResponse.json(),
      ])) as [LayoutStateResponse, AgentStateResponse]

      startTransition(() => {
        setLayouts(layoutState.layouts)
        setDraftLayouts(layoutState.draftLayouts)
      })

      const nextDraft = layoutState.draftLayouts.find(
        (draft) =>
          draft.status === 'draft' &&
          Boolean(draft.layout) &&
          !input.existingDraftIds.has(draft.id),
      )

      if (nextDraft) {
        return nextDraft
      }

      if (agentState.session?.runState === 'error') {
        throw new Error(
          agentState.session.lastError ?? 'The agent failed before saving a layout draft.',
        )
      }

      await delay(1500)
    }

    throw new Error('Timed out waiting for a new layout draft.')
  }

  async function handleAcceptDraft(draftId: string) {
    setLayoutActionPending(true)

    try {
      const response = await fetch(
        buildCodebaseVisualizerDraftActionRoute(draftId, 'accept'),
        {
          method: 'POST',
        },
      )

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(
          response,
          `Accept draft failed with status ${response.status}.`,
        ))
      }

      const result = (await response.json()) as DraftMutationResponse

      await refreshLayoutState()

      startTransition(() => {
        setActiveDraftId(null)
        setActiveLayoutId(result.layout?.id ?? null)
        setErrorMessage(null)
      })
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to accept layout draft.',
      )
    } finally {
      setLayoutActionPending(false)
    }
  }

  async function handleRejectDraft(draftId: string) {
    setLayoutActionPending(true)

    try {
      const response = await fetch(
        buildCodebaseVisualizerDraftActionRoute(draftId, 'reject'),
        {
          method: 'POST',
        },
      )

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(
          response,
          `Reject draft failed with status ${response.status}.`,
        ))
      }

      await refreshLayoutState()

      if (activeDraftId === draftId) {
        startTransition(() => {
          setActiveDraftId(null)
        })
      }

      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to reject layout draft.',
      )
    } finally {
      setLayoutActionPending(false)
    }
  }

  return (
    <main className="demo-page">
      {status === 'loading' || status === 'idle' ? (
        <section className="demo-status">Indexing files from the current workspace...</section>
      ) : errorMessage ? (
        <section className="demo-status is-error">{errorMessage}</section>
      ) : (
        <CodebaseVisualizer
          layoutActionsPending={layoutActionPending}
          layoutSuggestionError={layoutSuggestionError}
          layoutSuggestionPending={layoutSuggestionPending}
          onAcceptDraft={handleAcceptDraft}
          onRejectDraft={handleRejectDraft}
          onSuggestLayout={handleSuggestLayout}
        />
      )}
    </main>
  )
}

function buildLayoutSuggestionPrompt(rootDir: string, layoutBrief: string) {
  const instructionsPath = `${rootDir}/.codebase-visualizer/INSTRUCTIONS.md`

  return [
    `Look up "${instructionsPath}" and follow it to construct a new Codebase Visualizer layout draft for this repository.`,
    'Use the following layout brief:',
    layoutBrief,
    'Save the result as a draft layout so it appears in Codebase Visualizer.',
    'Do not answer with prose in chat. Do the work and stop after the draft has been saved.',
  ].join('\n\n')
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

async function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  try {
    const payload = (await response.json()) as { message?: string }

    if (payload?.message) {
      return payload.message
    }
  } catch {
    // Ignore non-JSON error bodies and fall back to the caller-provided message.
  }

  return fallbackMessage
}

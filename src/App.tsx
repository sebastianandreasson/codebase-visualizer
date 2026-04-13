import { startTransition, useEffect, useState } from 'react'

import { CodebaseVisualizer } from './index'
import type { CodebaseSnapshot } from './types'
import { CODEBASE_VISUALIZER_ROUTE } from './vite'

export default function App() {
  const [snapshot, setSnapshot] = useState<CodebaseSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false

    async function loadSnapshot() {
      try {
        const response = await fetch(CODEBASE_VISUALIZER_ROUTE)

        if (!response.ok) {
          throw new Error(`Snapshot request failed with status ${response.status}.`)
        }

        const data = (await response.json()) as CodebaseSnapshot

        if (isCancelled) {
          return
        }

        startTransition(() => {
          setSnapshot(data)
          setErrorMessage(null)
        })
      } catch (error) {
        if (isCancelled) {
          return
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load the codebase.',
        )
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadSnapshot()

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <main className="demo-page">
      <header className="demo-header">
        <p className="demo-kicker">codebase-visualizer</p>
        <h1>Package scaffold with live workspace scanning</h1>
        <p className="demo-copy">
          This demo reads the current project directory through the package Vite
          plugin and renders a minimal tree plus source preview.
        </p>
      </header>

      {isLoading ? (
        <section className="demo-status">Indexing files from the current workspace...</section>
      ) : errorMessage ? (
        <section className="demo-status is-error">{errorMessage}</section>
      ) : (
        <CodebaseVisualizer snapshot={snapshot} />
      )}
    </main>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  fetchAutonomousRunDetail,
  fetchAutonomousRunTimeline,
  fetchAutonomousRuns,
  startAutonomousRun as startAutonomousRunRequest,
  stopAutonomousRun as stopAutonomousRunRequest,
} from './apiClient'
import type {
  AutonomousRunDetail,
  AutonomousRunScope,
  AutonomousRunSummary,
  AutonomousRunTimelinePoint,
} from '../types'

interface UseAutonomousRunsControllerOptions {
  rootDir: string | null | undefined
  runsSurfaceOpen: boolean
}

interface AutonomousRunListState {
  detectedTaskFile: string | null
  runs: AutonomousRunSummary[]
}

interface SelectedRunState {
  detail: AutonomousRunDetail | null
  runId: string | null
  timeline: AutonomousRunTimelinePoint[]
}

const EMPTY_RUN_LIST: AutonomousRunListState = {
  detectedTaskFile: null,
  runs: [],
}
const EMPTY_SELECTED_RUN: SelectedRunState = {
  detail: null,
  runId: null,
  timeline: [],
}

export function useAutonomousRunsController({
  rootDir,
  runsSurfaceOpen,
}: UseAutonomousRunsControllerOptions) {
  const [runList, setRunList] = useState<AutonomousRunListState>(EMPTY_RUN_LIST)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<SelectedRunState>(EMPTY_SELECTED_RUN)
  const [runActionPending, setRunActionPending] = useState(false)
  const [runActionError, setRunActionError] = useState<string | null>(null)
  const autonomousRuns = runList.runs
  const detectedTaskFile = runList.detectedTaskFile
  const selectedRunMatchesSelection = selectedRun.runId === selectedRunId
  const selectedRunDetail = selectedRunMatchesSelection ? selectedRun.detail : null
  const selectedRunTimeline = selectedRunMatchesSelection ? selectedRun.timeline : []

  const hasRunningAutonomousRun = useMemo(
    () => autonomousRuns.some((run) => run.status === 'running'),
    [autonomousRuns],
  )
  const activeRunId = useMemo(
    () => autonomousRuns.find((run) => run.status === 'running')?.runId ?? null,
    [autonomousRuns],
  )

  useEffect(() => {
    let cancelled = false

    if (!runsSurfaceOpen || !rootDir) {
      return
    }

    const refreshRuns = async () => {
      try {
        const runsResponse = await fetchAutonomousRuns()

        if (cancelled) {
          return
        }

        setRunList({
          detectedTaskFile: runsResponse.detectedTaskFile,
          runs: runsResponse.runs,
        })
        setRunActionError(null)
        setSelectedRunId((currentRunId) => {
          if (currentRunId && runsResponse.runs.some((run) => run.runId === currentRunId)) {
            return currentRunId
          }

          return (
            runsResponse.runs.find((run) => run.status === 'running')?.runId ??
            runsResponse.runs[0]?.runId ??
            null
          )
        })
      } catch (error) {
        if (!cancelled) {
          setRunActionError(
            error instanceof Error ? error.message : 'Failed to load autonomous runs.',
          )
        }
      }
    }

    void refreshRuns()
    const intervalId = window.setInterval(() => {
      void refreshRuns()
    }, hasRunningAutonomousRun ? 2500 : 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [hasRunningAutonomousRun, rootDir, runsSurfaceOpen])

  useEffect(() => {
    let cancelled = false

    if (!runsSurfaceOpen || !rootDir || !selectedRunId) {
      setSelectedRun(EMPTY_SELECTED_RUN)
      return
    }

    const refreshRunDetail = async () => {
      try {
        const [detailResponse, timelineResponse] = await Promise.all([
          fetchAutonomousRunDetail(selectedRunId),
          fetchAutonomousRunTimeline(selectedRunId),
        ])

        if (cancelled) {
          return
        }

        setSelectedRun({
          detail: detailResponse.run,
          runId: selectedRunId,
          timeline: timelineResponse.timeline,
        })
        setRunActionError(null)
      } catch (error) {
        if (!cancelled) {
          setRunActionError(
            error instanceof Error ? error.message : 'Failed to load the selected run.',
          )
        }
      }
    }

    void refreshRunDetail()
    const intervalId = window.setInterval(() => {
      void refreshRunDetail()
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [rootDir, runsSurfaceOpen, selectedRunId])

  const handleStartAutonomousRun = useCallback(async (startScope: AutonomousRunScope | null) => {
    if (!rootDir) {
      return null
    }

    try {
      setRunActionPending(true)
      setRunActionError(null)
      const response = await startAutonomousRunRequest({
        scope: startScope,
        taskFile: detectedTaskFile,
      })

      setSelectedRunId(response.run.runId)
      setSelectedRun({
        detail: response.run,
        runId: response.run.runId,
        timeline: [],
      })
      setRunList((currentList) => ({
        ...currentList,
        detectedTaskFile: response.detectedTaskFile,
      }))
      return response.run.runId
    } catch (error) {
      setRunActionError(
        error instanceof Error ? error.message : 'Failed to start the autonomous run.',
      )
      return null
    } finally {
      setRunActionPending(false)
    }
  }, [detectedTaskFile, rootDir])

  const handleStopAutonomousRun = useCallback(async (runId: string) => {
    try {
      setRunActionPending(true)
      setRunActionError(null)
      await stopAutonomousRunRequest(runId)
    } catch (error) {
      setRunActionError(
        error instanceof Error ? error.message : 'Failed to stop the autonomous run.',
      )
    } finally {
      setRunActionPending(false)
    }
  }, [])

  const handleSelectRun = useCallback((runId: string) => {
    setSelectedRunId(runId)
  }, [])

  return {
    activeRunId,
    autonomousRuns,
    detectedTaskFile,
    handleSelectRun,
    handleStartAutonomousRun,
    handleStopAutonomousRun,
    hasRunningAutonomousRun,
    runActionError,
    runActionPending,
    selectedRunDetail,
    selectedRunId,
    selectedRunTimeline,
  }
}

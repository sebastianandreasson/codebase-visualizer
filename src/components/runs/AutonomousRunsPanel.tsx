import type {
  AutonomousRunDetail,
  AutonomousRunSummary,
  AutonomousRunTimelinePoint,
} from '../../types'

interface AutonomousRunsPanelProps {
  activeRunId: string | null
  detectedTaskFile: string | null
  errorMessage: string | null
  onClose: () => void
  onSelectRun: (runId: string) => void
  onStartRun: () => void
  onStopRun: (runId: string) => void
  pending: boolean
  selectedRunDetail: AutonomousRunDetail | null
  selectedRunId: string | null
  timeline: AutonomousRunTimelinePoint[]
  runs: AutonomousRunSummary[]
}

export function AutonomousRunsPanel({
  activeRunId,
  detectedTaskFile,
  errorMessage,
  onClose,
  onSelectRun,
  onStartRun,
  onStopRun,
  pending,
  selectedRunDetail,
  selectedRunId,
  timeline,
  runs,
}: AutonomousRunsPanelProps) {
  return (
    <div
      className="cbv-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-label="Autonomous runs"
        className="cbv-modal cbv-runs-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cbv-modal-header">
          <div>
            <p className="cbv-eyebrow">Autonomous runs</p>
            <strong>TODO-driven `pi-harness` runs</strong>
          </div>
          <button
            aria-label="Close runs panel"
            className="cbv-inspector-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="cbv-runs-toolbar">
          <div className="cbv-runs-task-file">
            <p className="cbv-eyebrow">Detected TODO file</p>
            <strong title={detectedTaskFile ?? 'No TODO file detected'}>
              {detectedTaskFile ?? 'No TODO file found'}
            </strong>
          </div>
          <div className="cbv-runs-actions">
            <button
              disabled={pending || !detectedTaskFile || Boolean(activeRunId)}
              onClick={onStartRun}
              type="button"
            >
              {pending ? 'Starting…' : 'Start Run'}
            </button>
            {activeRunId ? (
              <button
                className="is-danger"
                disabled={pending}
                onClick={() => onStopRun(activeRunId)}
                type="button"
              >
                Stop Active Run
              </button>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <p className="cbv-runs-error">{errorMessage}</p>
        ) : null}

        <div className="cbv-runs-layout">
          <div className="cbv-runs-list">
            {runs.length === 0 ? (
              <div className="cbv-empty">
                <h2>No runs yet</h2>
                <p>Start a harness-managed run to see progress, TODO completion, and telemetry here.</p>
              </div>
            ) : (
              runs.map((run) => (
                <button
                  className={`cbv-run-list-item${selectedRunId === run.runId ? ' is-active' : ''}${run.status === 'running' ? ' is-running' : ''}`}
                  key={run.runId}
                  onClick={() => onSelectRun(run.runId)}
                  type="button"
                >
                  <div className="cbv-run-list-item-header">
                    <strong>{run.task || run.runId}</strong>
                    <span className={`cbv-agent-status is-${run.status}`}>{run.status}</span>
                  </div>
                  <p>{run.phase || 'No phase yet'}</p>
                  <small>
                    iteration {run.iteration || 0} · {run.requestCount} requests · {Math.round(run.totalTokens)} tokens
                  </small>
                </button>
              ))
            )}
          </div>

          <div className="cbv-run-detail">
            {selectedRunDetail ? (
              <>
                <div className="cbv-run-summary-card">
                  <div className="cbv-run-summary-row">
                    <span>Status</span>
                    <strong>{selectedRunDetail.status}</strong>
                  </div>
                  <div className="cbv-run-summary-row">
                    <span>Task</span>
                    <strong>{selectedRunDetail.task || 'No active task'}</strong>
                  </div>
                  <div className="cbv-run-summary-row">
                    <span>Phase</span>
                    <strong>{selectedRunDetail.phase || 'Not started'}</strong>
                  </div>
                  <div className="cbv-run-summary-row">
                    <span>Completed TODOs</span>
                    <strong>{selectedRunDetail.completedTodoCount}</strong>
                  </div>
                  <div className="cbv-run-summary-row">
                    <span>Tokens</span>
                    <strong>{Math.round(selectedRunDetail.totalTokens)}</strong>
                  </div>
                  {selectedRunDetail.scope ? (
                    <div className="cbv-run-scope">
                      <p className="cbv-eyebrow">Working set scope</p>
                      <strong>{selectedRunDetail.scope.title ?? 'Scoped run'}</strong>
                      <ul>
                        {selectedRunDetail.scope.paths.slice(0, 8).map((path) => (
                          <li key={path}>{path}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="cbv-run-detail-grid">
                  <div className="cbv-run-detail-card">
                    <p className="cbv-eyebrow">Recent timeline</p>
                    {timeline.length > 0 ? (
                      <ul className="cbv-run-timeline">
                        {timeline.slice(-10).map((point) => (
                          <li key={point.key}>
                            <strong>{point.label || point.timestamp}</strong>
                            <span>{Math.round(point.totalTokens)} tokens</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No request timeline yet.</p>
                    )}
                  </div>

                  <div className="cbv-run-detail-card">
                    <p className="cbv-eyebrow">Completed TODOs</p>
                    {selectedRunDetail.todos.length > 0 ? (
                      <ul className="cbv-run-todos">
                        {selectedRunDetail.todos.slice(0, 10).map((todo) => (
                          <li key={todo.key}>
                            <strong>{todo.task}</strong>
                            <span>{Math.round(todo.totalTokens)} tokens</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No completed TODOs yet.</p>
                    )}
                  </div>
                </div>

                {selectedRunDetail.logExcerpt ? (
                  <div className="cbv-run-detail-card">
                    <p className="cbv-eyebrow">Recent log</p>
                    <pre className="cbv-run-log">{selectedRunDetail.logExcerpt}</pre>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="cbv-empty">
                <h2>No run selected</h2>
                <p>Select a run to inspect its progress, completed TODOs, and token timeline.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

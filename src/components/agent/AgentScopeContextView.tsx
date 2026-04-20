import type { WorkingSetState } from '../../types'
import {
  MAX_VISIBLE_CONTEXT_FILES,
  describeInspectorContext,
  describeScopeContextTitle,
  type AgentScopeContext,
} from '../../agent/agentScopeContext'

export function AgentScopeContextInline({
  hasInspectorContext,
  hasWorkingSetContext,
  inspectorContext,
  onAdoptInspectorContextAsWorkingSet,
  onClearWorkingSet,
  workingSet,
  workingSetContext,
  workingSetMatchesInspectorContext,
}: {
  hasInspectorContext: boolean
  hasWorkingSetContext: boolean
  inspectorContext: AgentScopeContext | null | undefined
  onAdoptInspectorContextAsWorkingSet?: () => void
  onClearWorkingSet?: () => void
  workingSet: WorkingSetState | null
  workingSetContext: AgentScopeContext | null
  workingSetMatchesInspectorContext: boolean
}) {
  if (hasWorkingSetContext && workingSetContext) {
    return (
      <div className="cbv-agent-context-inline">
        <span>ctx pinned</span>
        <strong>{describeScopeContextTitle(workingSetContext)}</strong>
        <em>{workingSet?.source === 'selection' ? 'selection' : 'working-set'}</em>
        <details>
          <summary>paths</summary>
          <AgentScopeContextList context={workingSetContext} />
          <AgentScopeContextOverflow context={workingSetContext} />
        </details>
        <div className="cbv-agent-context-actions">
          {hasInspectorContext &&
          !workingSetMatchesInspectorContext &&
          onAdoptInspectorContextAsWorkingSet ? (
            <button onClick={onAdoptInspectorContextAsWorkingSet} type="button">
              replace
            </button>
          ) : null}
          {onClearWorkingSet ? (
            <button className="is-secondary" onClick={onClearWorkingSet} type="button">
              clear
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (hasInspectorContext && inspectorContext) {
    return (
      <div className="cbv-agent-context-inline">
        <span>ctx select</span>
        <strong>{describeScopeContextTitle(inspectorContext)}</strong>
        <em>{describeInspectorContext(inspectorContext)}</em>
        <details>
          <summary>paths</summary>
          <AgentScopeContextList context={inspectorContext} />
          <AgentScopeContextOverflow context={inspectorContext} />
        </details>
        {onAdoptInspectorContextAsWorkingSet ? (
          <div className="cbv-agent-context-actions">
            <button onClick={onAdoptInspectorContextAsWorkingSet} type="button">
              pin
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return null
}

export function AgentScopeContextList({
  context,
}: {
  context: AgentScopeContext
}) {
  if (context.symbols.length > 1) {
    return (
      <ul className="cbv-agent-context-list">
        {context.symbols.slice(0, MAX_VISIBLE_CONTEXT_FILES).map((symbol, index) => (
          <li key={symbol.id}>
            <strong>{index === 0 ? 'Primary' : `Symbol ${index + 1}`}</strong>
            <span>{symbol.path}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (context.files.length > 1) {
    return (
      <ul className="cbv-agent-context-list">
        {context.files.slice(0, MAX_VISIBLE_CONTEXT_FILES).map((file, index) => (
          <li key={file.id}>
            <strong>{index === 0 ? 'Primary' : `File ${index + 1}`}</strong>
            <span>{file.path}</span>
          </li>
        ))}
      </ul>
    )
  }

  return null
}

export function AgentScopeContextOverflow({
  context,
}: {
  context: AgentScopeContext
}) {
  if (context.symbols.length > MAX_VISIBLE_CONTEXT_FILES) {
    return (
      <p className="cbv-agent-context-more">
        + {context.symbols.length - MAX_VISIBLE_CONTEXT_FILES} more selected symbol
        {context.symbols.length - MAX_VISIBLE_CONTEXT_FILES === 1 ? '' : 's'}
      </p>
    )
  }

  if (context.files.length > MAX_VISIBLE_CONTEXT_FILES) {
    return (
      <p className="cbv-agent-context-more">
        + {context.files.length - MAX_VISIBLE_CONTEXT_FILES} more selected file
        {context.files.length - MAX_VISIBLE_CONTEXT_FILES === 1 ? '' : 's'}
      </p>
    )
  }

  return null
}

import type { RefObject } from 'react'

import type {
  AgentCommandInfo,
  AgentControlState,
  AgentSessionSummary,
  AgentTimelineItem,
} from '../../schema/agent'
import type { WorkingSetState } from '../../types'
import { buildComposerPlaceholder } from '../../agent/agentCommands'
import type { AgentScopeContext } from '../../agent/agentScopeContext'
import { AgentScopeContextInline } from './AgentScopeContextView'
import { AgentTerminalTimeline } from './AgentTimeline'

type SubmitMode = 'send' | 'steer' | 'follow_up'

export function AgentTerminal({
  commandSuggestions,
  composerRef,
  composerValue,
  hasInspectorContext,
  hasWorkingSetContext,
  inspectorContext,
  messageListRef,
  onAdoptInspectorContextAsWorkingSet,
  onClearWorkingSet,
  onComposerChange,
  onSubmit,
  onTimelineScroll,
  pending,
  sendDisabledReason,
  session,
  sessionCapabilities,
  sessionControls,
  timeline,
  workingSet,
  workingSetContext,
  workingSetMatchesInspectorContext,
}: {
  commandSuggestions: AgentCommandInfo[]
  composerRef: RefObject<HTMLTextAreaElement | null>
  composerValue: string
  hasInspectorContext: boolean
  hasWorkingSetContext: boolean
  inspectorContext: AgentScopeContext | null | undefined
  messageListRef: RefObject<HTMLDivElement | null>
  onAdoptInspectorContextAsWorkingSet?: () => void
  onClearWorkingSet?: () => void
  onComposerChange: (value: string) => void
  onSubmit: (mode?: SubmitMode) => void | Promise<void>
  onTimelineScroll: () => void
  pending: boolean
  sendDisabledReason: string | null
  session: AgentSessionSummary
  sessionCapabilities: NonNullable<AgentSessionSummary['capabilities']>
  sessionControls: AgentControlState | null
  timeline: AgentTimelineItem[]
  workingSet: WorkingSetState | null
  workingSetContext: AgentScopeContext | null
  workingSetMatchesInspectorContext: boolean
}) {
  return (
    <div className="cbv-agent-terminal">
      <AgentTerminalTimeline
        items={timeline}
        listRef={messageListRef}
        onScroll={onTimelineScroll}
      />

      <div className="cbv-agent-composer is-terminal">
        <AgentScopeContextInline
          hasInspectorContext={hasInspectorContext}
          hasWorkingSetContext={hasWorkingSetContext}
          inspectorContext={inspectorContext}
          onAdoptInspectorContextAsWorkingSet={onAdoptInspectorContextAsWorkingSet}
          onClearWorkingSet={onClearWorkingSet}
          workingSet={workingSet}
          workingSetContext={workingSetContext}
          workingSetMatchesInspectorContext={workingSetMatchesInspectorContext}
        />
        {commandSuggestions.length > 0 ? (
          <AgentCommandSuggestions commands={commandSuggestions} />
        ) : null}
        <div className="cbv-agent-composer-entry">
          <textarea
            ref={composerRef}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (event.metaKey || event.ctrlKey || !event.shiftKey)
              ) {
                event.preventDefault()
                void onSubmit(session.runState === 'running' ? 'steer' : 'send')
              }
            }}
            placeholder={buildComposerPlaceholder(session, sessionControls)}
            rows={1}
            value={composerValue}
          />
          <div className="cbv-agent-actions">
            {session.runState === 'running' ? (
              <>
                {sessionCapabilities.steer ? (
                  <button
                    disabled={pending || composerValue.trim().length === 0}
                    onClick={() => {
                      void onSubmit('steer')
                    }}
                    title={sendDisabledReason ?? undefined}
                    type="button"
                  >
                    Steer
                  </button>
                ) : null}
                {sessionCapabilities.followUp ? (
                  <button
                    className="is-secondary"
                    disabled={pending || composerValue.trim().length === 0}
                    onClick={() => {
                      void onSubmit('follow_up')
                    }}
                    title={sendDisabledReason ?? undefined}
                    type="button"
                  >
                    Follow-Up
                  </button>
                ) : null}
              </>
            ) : (
              <button
                disabled={
                  pending ||
                  composerValue.trim().length === 0 ||
                  !sessionCapabilities.prompt ||
                  session.runState === 'disabled' ||
                  session.runState === 'initializing'
                }
                title={sendDisabledReason ?? undefined}
                onClick={() => {
                  void onSubmit('send')
                }}
                type="button"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentCommandSuggestions({
  commands,
}: {
  commands: AgentCommandInfo[]
}) {
  return (
    <div className="cbv-agent-command-suggestions">
      {commands.map((command) => (
        <div
          className={[
            'cbv-agent-command-suggestion',
            `is-${command.source}`,
            command.enabled ? '' : 'is-disabled',
          ].filter(Boolean).join(' ')}
          key={`${command.source}:${command.name}`}
        >
          <strong>/{command.name}</strong>
          <span>{command.description ?? command.source}</span>
        </div>
      ))}
    </div>
  )
}

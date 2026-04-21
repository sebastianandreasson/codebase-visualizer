import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentEvent, AgentSessionSummary, AgentSettingsState } from '../schema/agent'

const bridgeInfo = {
  hasAgentBridge: false,
  hasDesktopHost: true,
}

type MockClientShape = {
  beginBrokeredLogin: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  createSession: ReturnType<typeof vi.fn>
  deleteSession: ReturnType<typeof vi.fn>
  getBridgeInfo: ReturnType<typeof vi.fn>
  getBrokerSession: ReturnType<typeof vi.fn>
  getControls: ReturnType<typeof vi.fn>
  getHttpState: ReturnType<typeof vi.fn>
  getSettings: ReturnType<typeof vi.fn>
  importCodexAuthSession: ReturnType<typeof vi.fn>
  listSessions: ReturnType<typeof vi.fn>
  logoutBrokeredAuthSession: ReturnType<typeof vi.fn>
  newSession: ReturnType<typeof vi.fn>
  resumeSession: ReturnType<typeof vi.fn>
  saveSettings: ReturnType<typeof vi.fn>
  sendMessage: ReturnType<typeof vi.fn>
  setActiveTools: ReturnType<typeof vi.fn>
  setModel: ReturnType<typeof vi.fn>
  setThinkingLevel: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  completeBrokeredLogin: ReturnType<typeof vi.fn>
}

const mockClient: MockClientShape = {
  beginBrokeredLogin: vi.fn(),
  cancel: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getBridgeInfo: vi.fn(),
  getBrokerSession: vi.fn(),
  getControls: vi.fn(),
  getHttpState: vi.fn(),
  getSettings: vi.fn(),
  importCodexAuthSession: vi.fn(),
  listSessions: vi.fn(),
  logoutBrokeredAuthSession: vi.fn(),
  newSession: vi.fn(),
  resumeSession: vi.fn(),
  saveSettings: vi.fn(),
  sendMessage: vi.fn(),
  setActiveTools: vi.fn(),
  setModel: vi.fn(),
  setThinkingLevel: vi.fn(),
  subscribe: vi.fn(),
  completeBrokeredLogin: vi.fn(),
}

vi.mock('../agent/DesktopAgentClient', () => {
  return {
    DesktopAgentClient: vi.fn(() => mockClient),
  }
})

import { AgentPanel } from './AgentPanel'

describe('AgentPanel OAuth reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockClient.getBridgeInfo.mockReturnValue(bridgeInfo)
    mockClient.subscribe.mockReturnValue(() => undefined)
    mockClient.cancel.mockResolvedValue(true)
    mockClient.sendMessage.mockResolvedValue(true)
    mockClient.listSessions.mockResolvedValue({ sessions: [] })
    mockClient.newSession.mockResolvedValue(null)
    mockClient.resumeSession.mockResolvedValue(null)
    mockClient.deleteSession.mockResolvedValue({
      fileOperations: [],
      messages: [],
      session: null,
      timeline: [],
    })
    mockClient.getControls.mockResolvedValue({
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [],
      models: [],
      sessionId: null,
      tools: [],
    })
    mockClient.setActiveTools.mockResolvedValue({
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [],
      models: [],
      sessionId: null,
      tools: [],
    })
    mockClient.setModel.mockResolvedValue(null)
    mockClient.setThinkingLevel.mockResolvedValue(null)
    mockClient.beginBrokeredLogin.mockResolvedValue({
      brokerSession: { state: 'pending' },
      implemented: true,
      loginUrl: 'https://auth.openai.com/oauth/authorize?fake=true',
      message: 'Opened the browser for ChatGPT sign-in.',
    })
    mockClient.getBrokerSession.mockResolvedValue({ state: 'pending' })
    mockClient.importCodexAuthSession.mockResolvedValue({
      brokerSession: { state: 'authenticated', accountLabel: 'tester@example.com' },
      message: 'Imported the local Codex ChatGPT session.',
    })
    mockClient.logoutBrokeredAuthSession.mockResolvedValue({ state: 'signed_out' })
    mockClient.completeBrokeredLogin.mockResolvedValue({
      ok: true,
      message: 'Sign-in completed. Return to Semanticode.',
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('recreates the session after polled OAuth completion and enables sending', async () => {
    const signedOutSettings = buildSettings({ brokerState: 'signed_out' })
    const authenticatedSettings = buildSettings({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
    })

    const disabledSession = buildSession({
      brokerState: 'signed_out',
      id: 'session-disabled',
      runState: 'disabled',
    })
    const readySession = buildSession({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
      id: 'session-ready',
      runState: 'ready',
    })

    let settingsCallCount = 0
    mockClient.getSettings.mockImplementation(async () => {
      settingsCallCount += 1
      return settingsCallCount === 1 ? signedOutSettings : authenticatedSettings
    })

    let httpStateCallCount = 0
    mockClient.getHttpState.mockImplementation(async () => {
      httpStateCallCount += 1
      return httpStateCallCount === 1
        ? { messages: [], session: disabledSession, timeline: [] }
        : { messages: [], session: readySession, timeline: [] }
    })

    mockClient.createSession
      .mockResolvedValue(disabledSession)
      .mockResolvedValueOnce(disabledSession)
      .mockResolvedValueOnce(readySession)

    render(<AgentPanel desktopHostAvailable />)

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1100))
    })

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    const sendButton = screen.getByRole('button', { name: 'Send' })
    const composer = screen.getByRole('textbox')

    expect(mockClient.createSession.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(sendButton.hasAttribute('disabled')).toBe(true)
    expect(sendButton.getAttribute('title')).toBe('Enter a prompt to send.')
    expect(composer).not.toBeNull()
  })

  it('persists the selected Codex-safe model before starting brokered sign-in', async () => {
    const user = userEvent.setup()
    const authenticatedSettings = buildSettings({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
    })
    const readySession = buildSession({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
      id: 'session-ready',
      runState: 'ready',
    })
    const refreshedSession = {
      ...readySession,
      id: 'session-after-save',
      modelId: 'gpt-5.4-mini',
    }

    mockClient.getSettings.mockResolvedValue(authenticatedSettings)
    mockClient.getHttpState
      .mockResolvedValueOnce({ messages: [], session: readySession, timeline: [] })
      .mockResolvedValueOnce({ messages: [], session: refreshedSession, timeline: [] })
    mockClient.createSession
      .mockResolvedValueOnce(readySession)
      .mockResolvedValueOnce(refreshedSession)
    mockClient.saveSettings.mockResolvedValue({
      ...authenticatedSettings,
      modelId: 'gpt-5.4-mini',
    })

    mockClient.beginBrokeredLogin.mockResolvedValue({
      brokerSession: { state: 'pending' },
      implemented: true,
      loginUrl: 'https://auth.openai.com/oauth/authorize?fake=true',
      message: 'Opened the browser for ChatGPT sign-in.',
    })

    render(<AgentPanel desktopHostAvailable settingsOnly />)

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    const modelSelect = screen.getByLabelText('Model')
    const signInButton = screen.getByRole('button', { name: 'Sign In With OpenAI' })

    expect(screen.queryByRole('option', { name: 'gpt-4.1-nano' })).toBeNull()
    expect(screen.getByRole('option', { name: 'gpt-5.4' })).not.toBeNull()

    await user.selectOptions(modelSelect, 'gpt-5.4-mini')
    await user.click(signInButton)

    await waitFor(() => {
      expect(mockClient.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          authMode: 'brokered_oauth',
          modelId: 'gpt-5.4-mini',
          provider: 'openai-codex',
        }),
      )
    })
  })

  it('collapses tool activity behind a summary row by default', async () => {
    const user = userEvent.setup()
    const readySession = buildSession({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
      id: 'session-ready',
      runState: 'ready',
    })
    let listener: ((event: AgentEvent) => void) | null = null

    mockClient.getBridgeInfo.mockReturnValue({
      hasAgentBridge: true,
      hasDesktopHost: true,
    })
    mockClient.subscribe.mockImplementation((nextListener) => {
      listener = nextListener
      return () => undefined
    })
    mockClient.getSettings.mockResolvedValue(buildSettings({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
    }))
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [
        {
          blockKind: 'text',
          createdAt: '2026-04-15T00:00:00.000Z',
          id: 'timeline:user',
          messageId: 'message:user',
          role: 'user',
          text: 'Change the panel',
          type: 'message',
        },
        {
          createdAt: '2026-04-15T00:00:01.000Z',
          event: 'turn_start',
          id: 'timeline:turn',
          label: 'turn start',
          status: 'running',
          type: 'lifecycle',
        },
      ],
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getByText('Change the panel')).not.toBeNull()
    })
    await waitFor(() => {
      expect(listener).not.toBeNull()
    })

    await act(async () => {
      listener?.({
        items: [
          {
            blockKind: 'text',
            createdAt: '2026-04-15T00:00:00.000Z',
            id: 'timeline:user',
            messageId: 'message:user',
            role: 'user',
            text: 'Change the panel',
            type: 'message',
          },
          {
            blockKind: 'thinking',
            createdAt: '2026-04-15T00:00:01.500Z',
            id: 'agent-timeline:message:thinking',
            isStreaming: true,
            messageId: 'message-thinking',
            role: 'assistant',
            text: 'Looking through the app entry point.',
            type: 'message',
          },
          {
            createdAt: '2026-04-15T00:00:01.750Z',
            event: 'message_start',
            id: 'timeline:tool-start',
            label: 'tool call queued',
            status: 'running',
            type: 'lifecycle',
          },
          {
            args: { path: 'src/App.tsx' },
            createdAt: '2026-04-15T00:00:02.000Z',
            id: 'agent-timeline:tool:call-1',
            startedAt: '2026-04-15T00:00:02.000Z',
            status: 'running',
            symbolNodeIds: ['symbol:src/App.tsx:App'],
            toolCallId: 'call-1',
            toolName: 'read',
            type: 'tool',
          },
          {
            blockKind: 'text',
            createdAt: '2026-04-15T00:00:02.500Z',
            id: 'agent-timeline:message:tool-result:text:0',
            messageId: 'message-tool-result',
            role: 'tool',
            text: 'Tool result with many lines that should stay inside the collapsed activity group.',
            type: 'message',
          },
        ],
        revision: 2,
        sessionId: readySession.id,
        type: 'timeline_snapshot',
      })
    })

    const activitySummary = screen.getByText(/1 tool call/)
    const activityDetails = activitySummary.closest('details')

    expect(activityDetails?.hasAttribute('open')).toBe(false)
    expect(screen.getByText(/1 thinking/)).not.toBeNull()
    expect(screen.getByText(/1 tool result/)).not.toBeNull()
    expect(screen.getByText(/1 event/)).not.toBeNull()
    expect(screen.getAllByText(/1 tool call/)).toHaveLength(1)

    await user.click(activitySummary)

    expect(activityDetails?.hasAttribute('open')).toBe(true)
    expect(screen.getByText('tool read src/App.tsx')).not.toBeNull()
    expect(screen.getByText('symbols src/App.tsx:App')).not.toBeNull()
    expect(screen.getByText('Looking through the app entry point.')).not.toBeNull()
    expect(screen.getByText(/Tool result with many lines/).closest('details')).toBe(
      activityDetails,
    )
    expect(screen.getByText('tool call queued').closest('details')).toBe(activityDetails)
  })

  it('replaces the empty streaming assistant placeholder with the text row', async () => {
    const readySession = buildSession({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
      id: 'session-ready',
      runState: 'ready',
    })
    let listener: ((event: AgentEvent) => void) | null = null

    mockClient.getBridgeInfo.mockReturnValue({
      hasAgentBridge: true,
      hasDesktopHost: true,
    })
    mockClient.subscribe.mockImplementation((nextListener) => {
      listener = nextListener
      return () => undefined
    })
    mockClient.getSettings.mockResolvedValue(buildSettings({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
    }))
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [],
    })

    const { container } = render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(listener).not.toBeNull()
    })

    await act(async () => {
      listener?.({
        items: [
          {
            blockKind: 'text',
            createdAt: '2026-04-15T00:00:01.000Z',
            id: 'agent-timeline:message:message-assistant:empty',
            isStreaming: true,
            messageId: 'message-assistant',
            role: 'assistant',
            text: '',
            type: 'message',
          },
        ],
        revision: 1,
        sessionId: readySession.id,
        type: 'timeline_snapshot',
      })
    })

    await act(async () => {
      listener?.({
        items: [
          {
            blockKind: 'text',
            createdAt: '2026-04-15T00:00:01.000Z',
            id: 'agent-timeline:message:message-assistant:text:0',
            isStreaming: true,
            messageId: 'message-assistant',
            role: 'assistant',
            text: 'hi there',
            type: 'message',
          },
        ],
        revision: 2,
        sessionId: readySession.id,
        type: 'timeline_snapshot',
      })
    })

    expect(screen.getByText('hi there')).not.toBeNull()
    expect(
      container.querySelectorAll('.cbv-agent-terminal-row.is-message.is-assistant'),
    ).toHaveLength(1)
  })

  it('lists saved local sessions and resumes the selected one', async () => {
    const user = userEvent.setup()
    const activeSession = {
      ...buildSdkSession({
        id: 'sdk-session-a',
        runState: 'ready',
      }),
      sessionFile: '/tmp/session-a.jsonl',
      sessionName: 'Current cleanup',
    }
    const resumedSession = {
      ...buildSdkSession({
        id: 'sdk-session-b',
        runState: 'ready',
      }),
      sessionFile: '/tmp/session-b.jsonl',
      sessionName: 'Review auth flow',
    }
    let currentSession = activeSession

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockImplementation(async () => ({
      messages: [],
      session: currentSession,
      timeline: [],
    }))
    mockClient.resumeSession.mockImplementation(async () => {
      currentSession = resumedSession
      return resumedSession
    })
    mockClient.listSessions.mockResolvedValue({
      sessions: [
        buildSessionListItem({
          id: 'session-a',
          name: 'Current cleanup',
          path: '/tmp/session-a.jsonl',
          preview: 'Clean up current panel state.',
        }),
        buildSessionListItem({
          id: 'session-b',
          name: 'Review auth flow',
          path: '/tmp/session-b.jsonl',
          preview: 'Review auth flow.',
        }),
      ],
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Review auth flow/ })).not.toBeNull()
    })

    await user.click(screen.getByRole('button', { name: /^Review auth flow/ }))

    await waitFor(() => {
      expect(mockClient.resumeSession).toHaveBeenCalledWith('/tmp/session-b.jsonl')
    })
  })

  it('refreshes the saved session list after a session-created event', async () => {
    const activeSession = {
      ...buildSdkSession({
        id: 'sdk-session-a',
        runState: 'ready',
      }),
      sessionFile: '/tmp/session-a.jsonl',
      sessionName: 'Current cleanup',
    }
    const createdSession = {
      ...buildSdkSession({
        id: 'sdk-session-b',
        runState: 'ready',
      }),
      sessionFile: '/tmp/session-b.jsonl',
      sessionName: 'Event session',
    }
    let listener: ((event: AgentEvent) => void) | null = null
    let listedSessions: ReturnType<typeof buildSessionListItem>[] = []

    mockClient.getBridgeInfo.mockReturnValue({
      hasAgentBridge: true,
      hasDesktopHost: true,
    })
    mockClient.subscribe.mockImplementation((nextListener) => {
      listener = nextListener
      return () => undefined
    })
    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: activeSession,
      timeline: [],
    })
    mockClient.listSessions.mockImplementation(async () => ({ sessions: listedSessions }))

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(listener).not.toBeNull()
    })

    listedSessions = [
      buildSessionListItem({
        id: 'session-b',
        name: 'Event session',
        path: '/tmp/session-b.jsonl',
        preview: 'Created from an event.',
      }),
    ]

    await act(async () => {
      listener?.({
        session: createdSession,
        type: 'session_created',
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Event session/ })).not.toBeNull()
    })
  })

  it('deletes a saved local session from the rail', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const activeSession = {
      ...buildSdkSession({
        id: 'sdk-session-a',
        runState: 'ready',
      }),
      sessionFile: '/tmp/session-a.jsonl',
      sessionName: 'Current cleanup',
    }

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: activeSession,
      timeline: [],
    })
    mockClient.deleteSession.mockResolvedValue({
      fileOperations: [],
      messages: [],
      session: activeSession,
      timeline: [],
    })
    mockClient.listSessions.mockResolvedValue({
      sessions: [
        buildSessionListItem({
          id: 'session-a',
          name: 'Current cleanup',
          path: '/tmp/session-a.jsonl',
          preview: 'Clean up current panel state.',
        }),
        buildSessionListItem({
          id: 'session-b',
          name: 'Review auth flow',
          path: '/tmp/session-b.jsonl',
          preview: 'Review auth flow.',
        }),
      ],
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Review auth flow/ })).not.toBeNull()
    })

    await user.click(screen.getByRole('button', { name: /Delete Review auth flow/ }))

    await waitFor(() => {
      expect(mockClient.deleteSession).toHaveBeenCalledWith('/tmp/session-b.jsonl')
    })
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('does not force-scroll when timeline updates after the user scrolls away', async () => {
    const readySession = buildSession({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
      id: 'session-ready',
      runState: 'ready',
    })
    let listener: ((event: AgentEvent) => void) | null = null

    mockClient.getBridgeInfo.mockReturnValue({
      hasAgentBridge: true,
      hasDesktopHost: true,
    })
    mockClient.subscribe.mockImplementation((nextListener) => {
      listener = nextListener
      return () => undefined
    })
    mockClient.getSettings.mockResolvedValue(buildSettings({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
    }))
    const initialTimeline = [
      {
        blockKind: 'text' as const,
        createdAt: '2026-04-15T00:00:00.000Z',
        id: 'timeline:user',
        messageId: 'message:user',
        role: 'user' as const,
        text: 'hello',
        type: 'message' as const,
      },
    ]

    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: initialTimeline,
    })

    const { container } = render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(listener).not.toBeNull()
    })

    await waitFor(() => {
      expect(container.querySelector('.cbv-agent-terminal-timeline')).not.toBeNull()
    })

    const timelineElement = container.querySelector('.cbv-agent-terminal-timeline') as HTMLDivElement

    Object.defineProperty(timelineElement, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
    Object.defineProperty(timelineElement, 'clientHeight', {
      configurable: true,
      value: 300,
    })
    timelineElement.scrollTop = 120
    fireEvent.scroll(timelineElement)

    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [
        ...initialTimeline,
        {
          blockKind: 'text',
          createdAt: '2026-04-15T00:00:01.000Z',
          id: 'timeline:assistant',
          isStreaming: true,
          messageId: 'message-assistant',
          role: 'assistant',
          text: 'streaming response',
          type: 'message',
        },
      ],
    })

    await act(async () => {
      listener?.({
        items: [
          ...initialTimeline,
          {
            blockKind: 'text',
            createdAt: '2026-04-15T00:00:01.000Z',
            id: 'timeline:assistant',
            isStreaming: true,
            messageId: 'message-assistant',
            role: 'assistant',
            text: 'streaming response',
            type: 'message',
          },
        ],
        revision: 2,
        sessionId: readySession.id,
        type: 'timeline_snapshot',
      })
    })

    await act(async () => {
      listener?.({
        message: {
          blocks: [{ kind: 'text', text: 'streaming response' }],
          createdAt: '2026-04-15T00:00:01.000Z',
          id: 'message-assistant',
          isStreaming: true,
          role: 'assistant',
        },
        sessionId: readySession.id,
        type: 'message',
      })
    })

    await waitFor(() => {
      expect(screen.getByText('streaming response')).not.toBeNull()
    })
    expect(timelineElement.scrollTop).toBe(120)
  })

  it('surfaces SDK slash commands and lets the SDK execute them as prompts', async () => {
    const user = userEvent.setup()
    const readySession = buildSdkSession({
      id: 'sdk-session',
      runState: 'ready',
    })

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [],
    })
    mockClient.getControls.mockResolvedValue({
      activeToolNames: ['read'],
      availableThinkingLevels: ['low', 'medium', 'high'],
      commands: [
        {
          available: true,
          description: 'Fix failing tests',
          enabled: true,
          name: 'fix-tests',
          source: 'prompt',
        },
        {
          available: true,
          description: 'Show or change SDK active tools.',
          enabled: true,
          name: 'tools',
          source: 'semanticode',
        },
      ],
      models: [{ authMode: 'api_key', id: 'gpt-5.4', provider: 'openai' }],
      runtimeKind: 'pi-sdk',
      sessionId: readySession.id,
      tools: [
        {
          active: true,
          name: 'read',
        },
      ],
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    const composer = screen.getByRole('textbox')

    await user.type(composer, '/fix-tests')

    expect(screen.getAllByText('/fix-tests').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          displayText: '/fix-tests',
          message: '/fix-tests',
        }),
      )
    })
  })

  it('changes the SDK thinking level from the header selector', async () => {
    const user = userEvent.setup()
    const readySession = {
      ...buildSdkSession({
        id: 'sdk-session',
        runState: 'ready',
      }),
      thinkingLevel: 'medium' as const,
    }
    const updatedSession = {
      ...readySession,
      thinkingLevel: 'high' as const,
    }
    let currentSession: AgentSessionSummary = readySession

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockImplementation(async () => ({
      messages: [],
      session: currentSession,
      timeline: [],
    }))
    mockClient.getControls.mockResolvedValue({
      activeToolNames: ['read'],
      availableThinkingLevels: ['low', 'medium', 'high'],
      commands: [],
      models: [{ authMode: 'api_key', id: 'gpt-5.4', provider: 'openai' }],
      runtimeKind: 'pi-sdk',
      sessionId: readySession.id,
      tools: [{ active: true, name: 'read' }],
    })
    mockClient.setThinkingLevel.mockImplementation(async () => {
      currentSession = updatedSession
      return updatedSession
    })

    render(<AgentPanel desktopHostAvailable />)

    const thinkingSelect = await screen.findByLabelText('Thinking level')
    await user.selectOptions(thinkingSelect, 'high')

    await waitFor(() => {
      expect(mockClient.setThinkingLevel).toHaveBeenCalledWith('high')
    })
  })

  it('uses SDK active-tool controls instead of sending /tools to the agent', async () => {
    const user = userEvent.setup()
    const readySession = buildSdkSession({
      id: 'sdk-session',
      runState: 'ready',
    })
    const controls = {
      activeToolNames: ['read'],
      availableThinkingLevels: ['medium'],
      commands: [
        {
          available: true,
          description: 'Show or change SDK active tools.',
          enabled: true,
          name: 'tools',
          source: 'semanticode' as const,
        },
      ],
      models: [{ authMode: 'api_key', id: 'gpt-5.4', provider: 'openai' }],
      runtimeKind: 'pi-sdk' as const,
      sessionId: readySession.id,
      tools: [
        { active: true, name: 'read' },
        { active: false, name: 'grep' },
      ],
    }

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [],
    })
    mockClient.getControls.mockResolvedValue(controls)
    mockClient.setActiveTools.mockResolvedValue({
      ...controls,
      activeToolNames: ['read', 'grep'],
      tools: [
        { active: true, name: 'read' },
        { active: true, name: 'grep' },
      ],
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    await user.type(screen.getByRole('textbox'), '/tools read grep')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockClient.setActiveTools).toHaveBeenCalledWith(['read', 'grep'])
    })
    expect(mockClient.sendMessage).not.toHaveBeenCalled()
  })

  it('switches SDK models from the session header selector through the model control path', async () => {
    const user = userEvent.setup()
    const readySession = buildSdkSession({
      id: 'sdk-session',
      runState: 'ready',
    })
    const switchedSession = {
      ...readySession,
      modelId: 'gpt-5.4-mini',
    }
    let currentSession = readySession

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockImplementation(async () => ({
      messages: [],
      session: currentSession,
      timeline: [],
    }))
    mockClient.getControls.mockResolvedValue({
      activeToolNames: ['read'],
      availableThinkingLevels: ['medium'],
      commands: [],
      models: [
        { authMode: 'api_key', id: 'gpt-5.4', provider: 'openai' },
        { authMode: 'api_key', id: 'gpt-5.4-mini', provider: 'openai' },
      ],
      runtimeKind: 'pi-sdk',
      sessionId: readySession.id,
      tools: [{ active: true, name: 'read' }],
    })
    mockClient.createSession.mockImplementation(async () => currentSession)
    mockClient.setModel.mockImplementation(async () => {
      currentSession = switchedSession

      return switchedSession
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: 'Agent model' }))
    await user.click(screen.getByRole('option', { name: 'gpt-5.4-mini' }))

    await waitFor(() => {
      expect(mockClient.setModel).toHaveBeenCalledWith({
        authMode: 'api_key',
        modelId: 'gpt-5.4-mini',
        provider: 'openai',
      })
    })
  })

  it('can switch from Codex OAuth to a PI SDK local model from the session header selector', async () => {
    const user = userEvent.setup()
    const readySession = buildSession({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
      id: 'codex-session',
      runState: 'ready',
    })
    const switchedSession = {
      ...buildSdkSession({
        id: 'sdk-session',
        runState: 'ready',
      }),
      modelId: 'qwen2.5-coder:7b',
      provider: 'ollama',
    }
    let currentSession = readySession

    mockClient.getSettings.mockResolvedValue(buildSettings({
      accountLabel: 'tester@example.com',
      brokerState: 'authenticated',
    }))
    mockClient.getHttpState.mockImplementation(async () => ({
      messages: [],
      session: currentSession,
      timeline: [],
    }))
    mockClient.getControls.mockResolvedValue({
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [],
      models: [
        { authMode: 'brokered_oauth', id: 'gpt-5.4', provider: 'openai-codex' },
        { authMode: 'api_key', id: 'qwen2.5-coder:7b', provider: 'ollama' },
      ],
      runtimeKind: 'pi-sdk',
      sessionId: readySession.id,
      tools: [],
    })
    mockClient.setModel.mockImplementation(async () => {
      currentSession = switchedSession

      return switchedSession
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: 'Agent model' }))
    expect(screen.getByText('ollama')).toBeTruthy()
    await user.click(screen.getByRole('option', { name: 'qwen2.5-coder:7b' }))

    await waitFor(() => {
      expect(mockClient.setModel).toHaveBeenCalledWith({
        authMode: 'api_key',
        modelId: 'qwen2.5-coder:7b',
        provider: 'ollama',
      })
    })
  })

  it('opens the session model menu upward when the bottom pane is short', async () => {
    const user = userEvent.setup()
    const readySession = buildSdkSession({
      id: 'sdk-session',
      runState: 'ready',
    })

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 220,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 900,
    })

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [],
    })
    mockClient.getControls.mockResolvedValue({
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [],
      models: [
        { authMode: 'api_key', id: 'gpt-5.4', provider: 'openai' },
        { authMode: 'api_key', id: 'gpt-5.4-mini', provider: 'openai' },
        { authMode: 'api_key', id: 'qwen2.5-coder:7b', provider: 'ollama' },
      ],
      runtimeKind: 'pi-sdk',
      sessionId: readySession.id,
      tools: [],
    })

    render(<AgentPanel desktopHostAvailable />)

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    const trigger = screen.getByRole('button', { name: 'Agent model' })
    const picker = trigger.closest('.cbv-agent-model-picker')
    expect(picker).not.toBeNull()

    Object.defineProperty(picker, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 205,
        height: 28,
        left: 20,
        right: 260,
        top: 177,
        width: 240,
        x: 20,
        y: 177,
        toJSON: () => ({}),
      }),
    })

    await user.click(trigger)

    const menu = await screen.findByRole('listbox')

    expect(menu.style.position).toBe('fixed')
    expect(menu.style.top).toBe('auto')
    expect(menu.style.bottom).toBe('47px')
    expect(menu.style.maxHeight).toBe('165px')
  })

  it('keeps model selection available while the session is still starting', async () => {
    const user = userEvent.setup()
    const initialSettings = buildSettings({
      brokerState: 'signed_out',
    })
    const switchedSettings = {
      ...buildApiKeySettings(),
      availableModelsByProvider: {
        local: [{ id: 'qwen2.5-coder:7b' }],
        openai: [{ id: 'gpt-5.4' }],
      },
      availableProviders: ['openai', 'local'],
      modelId: 'qwen2.5-coder:7b',
      provider: 'local',
    }
    const switchedSession = {
      ...buildSdkSession({
        id: 'sdk-session',
        runState: 'ready',
      }),
      modelId: 'qwen2.5-coder:7b',
      provider: 'local',
    }

    mockClient.getSettings
      .mockResolvedValueOnce(initialSettings)
      .mockResolvedValue(switchedSettings)
    mockClient.getHttpState
      .mockResolvedValueOnce({
        messages: [],
        session: null,
        timeline: [],
      })
      .mockResolvedValueOnce({
        messages: [],
        session: null,
        timeline: [],
      })
      .mockResolvedValue({
        messages: [],
        session: switchedSession,
        timeline: [],
      })
    mockClient.getControls.mockResolvedValue({
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [],
      models: [
        { authMode: 'api_key', id: 'gpt-5.4', provider: 'openai' },
        { authMode: 'api_key', id: 'qwen2.5-coder:7b', provider: 'local' },
      ],
      runtimeKind: undefined,
      sessionId: null,
      tools: [],
    })
    mockClient.setModel.mockResolvedValue(null)
    mockClient.createSession.mockResolvedValue(switchedSession)

    render(<AgentPanel desktopHostAvailable />)

    const trigger = await screen.findByRole('button', { name: 'Agent model' })

    expect(screen.queryByText('Starting…')).toBeNull()

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'qwen2.5-coder:7b' }))

    await waitFor(() => {
      expect(mockClient.setModel).toHaveBeenCalledWith({
        authMode: 'api_key',
        modelId: 'qwen2.5-coder:7b',
        provider: 'local',
      })
    })

    expect(mockClient.createSession).toHaveBeenCalled()
    expect(screen.queryByText('Agent settings needed')).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('notifies when the active chat session is cleared', async () => {
    const user = userEvent.setup()
    const readySession = buildSdkSession({
      id: 'session-clear',
      runState: 'ready',
    })
    const onChatSessionCleared = vi.fn()

    mockClient.getSettings.mockResolvedValue(buildApiKeySettings())
    mockClient.getHttpState.mockResolvedValue({
      messages: [],
      session: readySession,
      timeline: [],
    })
    mockClient.getControls.mockResolvedValue({
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [],
      models: [],
      runtimeKind: 'pi-sdk',
      sessionId: readySession.id,
      tools: [],
    })

    render(
      <AgentPanel
        desktopHostAvailable
        onChatSessionCleared={onChatSessionCleared}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    })

    await user.type(screen.getByRole('textbox'), '/clear{enter}')

    await waitFor(() => {
      expect(onChatSessionCleared).toHaveBeenCalledWith(readySession)
    })
  })
})

function buildSettings(input: {
  accountLabel?: string
  brokerState: AgentSettingsState['brokerSession']['state']
}): AgentSettingsState {
  return {
    authMode: 'brokered_oauth',
    availableModelsByProvider: {
      'openai-codex': [{ id: 'gpt-5.4' }, { id: 'gpt-5.4-mini' }],
    },
    availableProviders: ['openai-codex'],
    brokerSession: {
      accountLabel: input.accountLabel,
      hasAppSessionToken: input.brokerState === 'authenticated',
      state: input.brokerState,
    },
    canEditAppServerUrl: true,
    canEditOpenAiOAuthConfig: true,
    hasApiKey: false,
    hasAppServerUrl: false,
    hasOpenAiOAuthClientId: false,
    hasOpenAiOAuthClientSecret: false,
    modelId: 'gpt-5.4',
    openAiOAuthClientId: '',
    provider: 'openai-codex',
    storageKind: 'plaintext',
    toolProfile: 'symbol_first',
  }
}

function buildApiKeySettings(): AgentSettingsState {
  return {
    ...buildSettings({
      accountLabel: undefined,
      brokerState: 'signed_out',
    }),
    authMode: 'api_key',
    availableModelsByProvider: {
      openai: [{ id: 'gpt-5.4' }, { id: 'gpt-5.4-mini' }],
    },
    availableProviders: ['openai'],
    brokerSession: {
      state: 'signed_out',
    },
    hasApiKey: true,
    provider: 'openai',
  }
}

function buildSession(input: {
  accountLabel?: string
  brokerState: NonNullable<AgentSessionSummary['brokerSession']>['state']
  id: string
  runState: AgentSessionSummary['runState']
}): AgentSessionSummary {
  return {
    authMode: 'brokered_oauth',
    bootPromptEnabled: false,
    brokerSession: {
      accountLabel: input.accountLabel,
      hasAppSessionToken: input.brokerState === 'authenticated',
      state: input.brokerState,
    },
    capabilities: input.runState === 'disabled'
      ? {
          compact: false,
          followUp: false,
          newSession: false,
          prompt: false,
          resumeSession: false,
          setThinkingLevel: false,
          steer: false,
        }
      : {
          compact: true,
          followUp: true,
          newSession: true,
          prompt: true,
          resumeSession: true,
          setThinkingLevel: true,
          steer: true,
        },
    createdAt: '2026-04-15T00:00:00.000Z',
    hasProviderApiKey: input.brokerState === 'authenticated',
    id: input.id,
    modelId: 'gpt-5.4',
    provider: 'openai-codex',
    runState: input.runState,
    runtimeKind: 'pi-sdk',
    transport: 'provider',
    updatedAt: '2026-04-15T00:00:00.000Z',
    workspaceRootDir: '/tmp/workspace',
  }
}

function buildSdkSession(input: {
  id: string
  runState: AgentSessionSummary['runState']
}): AgentSessionSummary {
  return {
    ...buildSession({
      brokerState: 'signed_out',
      id: input.id,
      runState: input.runState,
    }),
    authMode: 'api_key',
    brokerSession: undefined,
    capabilities: input.runState === 'disabled'
      ? {
          compact: false,
          followUp: false,
          newSession: false,
          prompt: false,
          resumeSession: false,
          setThinkingLevel: false,
          steer: false,
        }
      : {
          compact: true,
          followUp: true,
          newSession: true,
          prompt: true,
          resumeSession: true,
          setThinkingLevel: true,
          steer: true,
        },
    hasProviderApiKey: true,
    runtimeKind: 'pi-sdk',
    transport: 'provider',
  }
}

function buildSessionListItem(input: {
  id: string
  name: string
  path: string
  preview: string
}) {
  return {
    createdAt: '2026-04-15T00:00:00.000Z',
    id: input.id,
    messageCount: 4,
    modifiedAt: '2026-04-15T00:05:00.000Z',
    name: input.name,
    path: input.path,
    preview: input.preview,
  }
}

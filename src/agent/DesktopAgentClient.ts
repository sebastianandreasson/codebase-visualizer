import type { AgentEvent, AgentSessionSummary } from '../schema/agent'

interface DesktopAgentBridge {
  cancel?: () => Promise<boolean>
  createSession?: () => Promise<AgentSessionSummary | null>
  isAvailable?: boolean
  onEvent?: (listener: (event: AgentEvent) => void) => () => void
  sendMessage?: (message: string) => Promise<boolean>
}

export class DesktopAgentClient {
  private readonly bridge: DesktopAgentBridge | undefined

  constructor() {
    this.bridge = (
      globalThis as typeof globalThis & {
        codebaseVisualizerDesktopAgent?: DesktopAgentBridge
      }
    ).codebaseVisualizerDesktopAgent
  }

  isAvailable() {
    return Boolean(this.bridge?.isAvailable)
  }

  async createSession() {
    if (!this.bridge?.createSession) {
      return null
    }

    return this.bridge.createSession()
  }

  async sendMessage(message: string) {
    if (!this.bridge?.sendMessage) {
      return false
    }

    return this.bridge.sendMessage(message)
  }

  async cancel() {
    if (!this.bridge?.cancel) {
      return false
    }

    return this.bridge.cancel()
  }

  subscribe(listener: (event: AgentEvent) => void) {
    if (!this.bridge?.onEvent) {
      return () => undefined
    }

    return this.bridge.onEvent(listener)
  }
}


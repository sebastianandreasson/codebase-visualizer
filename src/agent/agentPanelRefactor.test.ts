import { describe, expect, it } from 'vitest'

import {
  getCommandSuggestions,
} from './agentCommands'
import {
  getSelectableModels,
} from './agentModelOptions'
import {
  buildWorkspaceContextInjection,
} from './agentPromptContext'
import {
  areScopeContextsEquivalent,
  getScopePaths,
  type AgentScopeContext,
} from './agentScopeContext'
import type {
  AgentControlState,
  AgentSettingsState,
} from '../schema/agent'
import type {
  CodebaseFile,
  PreprocessedWorkspaceContext,
  SemanticPurposeSummaryRecord,
  SymbolNode,
  WorkspaceProfile,
} from '../types'

describe('agent panel extracted helpers', () => {
  it('keeps scope equality based on selected node identity and order', () => {
    const firstContext = buildScopeContext({
      files: [buildFile('file:a', 'src/a.ts'), buildFile('file:b', 'src/b.ts')],
    })
    const sameContext = buildScopeContext({
      files: [buildFile('file:a', 'src/a.ts'), buildFile('file:b', 'src/b.ts')],
    })
    const reorderedContext = buildScopeContext({
      files: [buildFile('file:b', 'src/b.ts'), buildFile('file:a', 'src/a.ts')],
    })

    expect(areScopeContextsEquivalent(firstContext, sameContext)).toBe(true)
    expect(areScopeContextsEquivalent(firstContext, reorderedContext)).toBe(false)
  })

  it('includes the owning file path when a selected symbol has an owner file in scope', () => {
    const ownerFile = buildFile('file:panel', 'src/components/AgentPanel.tsx')
    const context = buildScopeContext({
      files: [ownerFile],
      symbol: buildSymbol('symbol:panel', 'AgentPanel', ownerFile.id),
    })

    expect(getScopePaths(context)).toEqual(['src/components/AgentPanel.tsx'])
  })

  it('builds workspace context injections without leaking the user-request sentinel', () => {
    const ownerFile = buildFile('file:panel', 'src/components/AgentPanel.tsx')
    const context = buildScopeContext({
      files: [ownerFile],
      symbol: buildSymbol('symbol:panel', 'AgentPanel', ownerFile.id),
    })
    const injection = buildWorkspaceContextInjection(
      buildWorkspaceProfile(),
      buildPreprocessedContext([
        buildPurposeSummary({
          fileId: ownerFile.id,
          path: 'src/components/AgentPanel.tsx:AgentPanel',
          symbolId: 'symbol:panel',
        }),
      ]),
      context,
      null,
    )

    expect(injection).toContain('Workspace preprocessing context:')
    expect(injection).toContain('Relevant preprocessed purpose summaries:')
    expect(injection).toContain('Semanticode working set:')
    expect(injection).not.toContain('__SEMANTICODE_USER_REQUEST__')
  })

  it('filters unavailable Codex OAuth models without affecting API key providers', () => {
    const settings = buildSettings()

    expect(
      getSelectableModels(settings, 'brokered_oauth', 'openai-codex')
        .map((model) => model.id),
    ).toEqual(['gpt-5.4'])
    expect(
      getSelectableModels(settings, 'api_key', 'openai-codex')
        .map((model) => model.id),
    ).toEqual(['gpt-4.1-nano', 'gpt-5.4'])
  })

  it('sorts command suggestions before semanticode-local commands', () => {
    const controls: AgentControlState = {
      activeToolNames: [],
      availableThinkingLevels: [],
      commands: [
        {
          available: true,
          enabled: true,
          name: 'tools',
          source: 'semanticode',
        },
        {
          available: true,
          enabled: true,
          name: 'fix-tests',
          source: 'prompt',
        },
      ],
      models: [],
      sessionId: null,
      tools: [],
    }

    expect(getCommandSuggestions('/', controls).map((command) => command.name))
      .toEqual(['fix-tests', 'tools'])
  })
})

function buildScopeContext(input: Partial<AgentScopeContext>): AgentScopeContext {
  return {
    file: null,
    files: [],
    node: null,
    symbol: null,
    symbols: [],
    ...input,
  }
}

function buildFile(id: string, path: string): CodebaseFile {
  return {
    content: null,
    extension: '.ts',
    facets: [],
    id,
    kind: 'file',
    name: path.split('/').at(-1) ?? path,
    parentId: null,
    path,
    size: 120,
    tags: [],
  }
}

function buildSymbol(id: string, name: string, fileId: string): SymbolNode {
  return {
    facets: [],
    fileId,
    id,
    kind: 'symbol',
    name,
    parentSymbolId: null,
    path: `${fileId}:${name}`,
    symbolKind: 'function',
    tags: [],
  }
}

function buildWorkspaceProfile(): WorkspaceProfile {
  return {
    entryFiles: ['src/main.tsx'],
    generatedAt: '2026-04-20T00:00:00.000Z',
    languages: ['TypeScript'],
    notableTags: ['entrypoint'],
    rootDir: '/workspace',
    summary: 'React app with an embedded agent panel.',
    topDirectories: ['src'],
    totalFiles: 12,
    totalSymbols: 40,
  }
}

function buildPreprocessedContext(
  purposeSummaries: SemanticPurposeSummaryRecord[],
): PreprocessedWorkspaceContext {
  return {
    isComplete: true,
    purposeSummaries,
    semanticEmbeddingModelId: null,
    semanticEmbeddings: [],
    snapshotId: 'snapshot:test',
    workspaceProfile: buildWorkspaceProfile(),
  }
}

function buildPurposeSummary(input: {
  fileId: string
  path: string
  symbolId: string
}): SemanticPurposeSummaryRecord {
  return {
    domainHints: ['agent-ui'],
    embeddingText: 'Agent panel orchestrates session UI.',
    fileId: input.fileId,
    generatedAt: '2026-04-20T00:00:00.000Z',
    generator: 'heuristic',
    path: input.path,
    sideEffects: ['updates-session'],
    sourceHash: 'hash:test',
    summary: 'Coordinates embedded agent session UI.',
    symbolId: input.symbolId,
    symbolKind: 'function',
  }
}

function buildSettings(): AgentSettingsState {
  return {
    authMode: 'brokered_oauth',
    availableModelsByProvider: {
      'openai-codex': [{ id: 'gpt-4.1-nano' }, { id: 'gpt-5.4' }],
    },
    availableProviders: ['openai-codex'],
    brokerSession: { state: 'authenticated' },
    canEditAppServerUrl: false,
    canEditOpenAiOAuthConfig: false,
    hasApiKey: false,
    hasAppServerUrl: false,
    hasOpenAiOAuthClientId: false,
    hasOpenAiOAuthClientSecret: false,
    modelId: 'gpt-5.4',
    provider: 'openai-codex',
    storageKind: 'safe_storage',
    toolProfile: 'symbol_first',
  }
}

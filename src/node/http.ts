import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  acceptLayoutDraft,
  listLayoutDrafts,
  listSavedLayouts,
  rejectLayoutDraft,
} from '../planner'
import type {
  DraftMutationResponse,
  LayoutStateResponse,
  ReadProjectSnapshotOptions,
} from '../types'
import { readProjectSnapshot } from './readProjectSnapshot'
import {
  CODEBASE_VISUALIZER_DRAFTS_ROUTE,
  CODEBASE_VISUALIZER_LAYOUTS_ROUTE,
  CODEBASE_VISUALIZER_ROUTE,
} from '../shared/constants'

export interface CodebaseVisualizerRequestHandlerOptions
  extends ReadProjectSnapshotOptions {
  rootDir: string
  route?: string
}

export async function handleCodebaseVisualizerRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  options: CodebaseVisualizerRequestHandlerOptions,
) {
  const route = options.route ?? CODEBASE_VISUALIZER_ROUTE
  const pathname = request.url?.split('?')[0]
  const method = request.method ?? 'GET'

  if (!pathname?.startsWith('/__codebase-visualizer/')) {
    return false
  }

  try {
    if (pathname === route && method === 'GET') {
      const snapshot = await readProjectSnapshot({
        ...options,
        rootDir: options.rootDir,
      })

      sendJson(response, 200, snapshot)
      return true
    }

    if (pathname === CODEBASE_VISUALIZER_LAYOUTS_ROUTE && method === 'GET') {
      const state: LayoutStateResponse = {
        layouts: await listSavedLayouts(options.rootDir),
        draftLayouts: await listLayoutDrafts(options.rootDir),
        activeLayoutId: null,
        activeDraftId: null,
      }

      sendJson(response, 200, state)
      return true
    }

    const draftMatch = pathname.match(
      new RegExp(`^${CODEBASE_VISUALIZER_DRAFTS_ROUTE}/([^/]+)/(accept|reject)$`),
    )

    if (draftMatch && method === 'POST') {
      const [, encodedDraftId, action] = draftMatch
      const draftId = decodeURIComponent(encodedDraftId)

      if (action === 'accept') {
        const layout = await acceptLayoutDraft(options.rootDir, draftId)
        const result: DraftMutationResponse = {
          ok: true,
          draftId,
          layout,
        }

        sendJson(response, 200, result)
        return true
      }

      await rejectLayoutDraft(options.rootDir, draftId)
      const result: DraftMutationResponse = {
        ok: true,
        draftId,
      }

      sendJson(response, 200, result)
      return true
    }

    return false
  } catch (error) {
    sendJson(response, 500, {
      message:
        error instanceof Error
          ? error.message
          : 'Failed to process codebase visualizer request.',
    })
    return true
  }
}

function sendJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: unknown,
) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

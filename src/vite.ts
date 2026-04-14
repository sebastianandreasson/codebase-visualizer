import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

import type { ReadProjectSnapshotOptions } from './types'
import { readProjectSnapshot } from './node/readProjectSnapshot'
import { CODEBASE_VISUALIZER_ROUTE } from './shared/constants'

export interface CodebaseVisualizerViteOptions
  extends ReadProjectSnapshotOptions {
  route?: string
}

export function codebaseVisualizerPlugin(
  options: CodebaseVisualizerViteOptions = {},
): Plugin {
  const route = options.route ?? CODEBASE_VISUALIZER_ROUTE

  return {
    name: 'codebase-visualizer',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleSnapshotRequest(
          request,
          response,
          next,
          route,
          options.rootDir ?? server.config.root,
          options,
        )
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleSnapshotRequest(
          request,
          response,
          next,
          route,
          options.rootDir ?? server.config.root,
          options,
        )
      })
    },
  }
}

async function handleSnapshotRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  next: () => void,
  route: string,
  rootDir: string,
  options: CodebaseVisualizerViteOptions,
) {
  const pathname = request.url?.split('?')[0]

  if (pathname !== route) {
    next()
    return
  }

  try {
    const snapshot = await readProjectSnapshot({
      ...options,
      rootDir,
    })

    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(snapshot))
  } catch (error) {
    response.statusCode = 500
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(
      JSON.stringify({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to generate codebase snapshot.',
      }),
    )
  }
}

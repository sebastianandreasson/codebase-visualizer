import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

import type { ReadProjectSnapshotOptions } from './types'
import { handleCodebaseVisualizerRequest } from './node/http'
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
        void handleCodebaseVisualizerMiddleware(
          request,
          response,
          next,
          options.rootDir ?? server.config.root,
          route,
          options,
        )
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleCodebaseVisualizerMiddleware(
          request,
          response,
          next,
          options.rootDir ?? server.config.root,
          route,
          options,
        )
      })
    },
  }
}

async function handleCodebaseVisualizerMiddleware(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  next: () => void,
  rootDir: string,
  route: string,
  options: CodebaseVisualizerViteOptions,
) {
  const handled = await handleCodebaseVisualizerRequest(request, response, {
    ...options,
    rootDir,
    route,
  })

  if (!handled) {
    next()
  }
}

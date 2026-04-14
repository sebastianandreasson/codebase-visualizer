import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ensureAgentInstructions } from './agentInstructions'
import { handleCodebaseVisualizerRequest } from '../node/http'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3210
const STANDALONE_HTML_ENTRY = '/standalone.html'

export interface RunCliOptions {
  args?: string[]
}

export async function runCli(options: RunCliOptions = {}) {
  const parsedArguments = parseArguments(options.args ?? process.argv.slice(2))

  if (parsedArguments.help) {
    printHelp()
    return
  }

  const rootDir = resolve(parsedArguments.rootDir ?? process.cwd())
  const instructionsPath = await ensureAgentInstructions(rootDir)
  const standaloneDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'standalone',
  )

  const server = createServer(async (request, response) => {
    const handled = await handleCodebaseVisualizerRequest(request, response, {
      rootDir,
      analyzeCalls: true,
      analyzeImports: true,
      analyzeSymbols: true,
    })

    if (handled) {
      return
    }

    await serveStandaloneAsset(request.url ?? '/', standaloneDir, response)
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(parsedArguments.port, parsedArguments.host, () => {
      server.off('error', rejectPromise)
      resolvePromise()
    })
  })

  const address = server.address()
  const port =
    typeof address === 'object' && address ? address.port : parsedArguments.port
  const host =
    typeof address === 'object' && address ? address.address : parsedArguments.host
  const url = `http://${host}:${port}`

  process.stdout.write(`Codebase Visualizer running at ${url}\n`)
  process.stdout.write(`Visualizing ${rootDir}\n`)
  process.stdout.write(`Agent instructions written to ${instructionsPath}\n\n`)
  process.stdout.write('Copy/paste this to your favorite coding agent:\n\n')
  process.stdout.write(
    [
      `Look up "${instructionsPath}" and follow it to construct a new Codebase Visualizer layout draft for this repository.`,
      'Use the following layout brief:',
      '"REPLACE WITH YOUR CUSTOM STRUCTURE HERE"',
      'Save the result as a draft layout so it appears in Codebase Visualizer.',
    ].join('\n') + '\n\n',
  )

  const shutdown = () => {
    server.close(() => {
      process.exit(0)
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

interface ParsedArguments {
  help: boolean
  host: string
  port: number
  rootDir: string | null
}

function parseArguments(args: string[]): ParsedArguments {
  let help = false
  let host = DEFAULT_HOST
  let port = DEFAULT_PORT
  let rootDir: string | null = null

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument === '--host') {
      host = args[index + 1] ?? host
      index += 1
      continue
    }

    if (argument === '--port' || argument === '-p') {
      const nextValue = Number(args[index + 1])

      if (!Number.isFinite(nextValue)) {
        throw new Error(`Invalid port value: ${args[index + 1] ?? ''}`)
      }

      port = nextValue
      index += 1
      continue
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`)
    }

    rootDir = argument
  }

  return {
    help,
    host,
    port,
    rootDir,
  }
}

async function serveStandaloneAsset(
  urlPath: string,
  standaloneDir: string,
  response: import('node:http').ServerResponse,
) {
  const pathname = decodeURIComponent(urlPath.split('?')[0] || '/')
  const normalizedPath =
    pathname === '/' ? STANDALONE_HTML_ENTRY : pathname.replace(/\/+$/, '') || STANDALONE_HTML_ENTRY
  const targetPath = resolve(standaloneDir, `.${normalizedPath}`)

  if (!targetPath.startsWith(standaloneDir)) {
    response.statusCode = 403
    response.end('Forbidden')
    return
  }

  try {
    const fileContents = await readFile(targetPath)
    response.statusCode = 200
    response.setHeader(
      'Content-Type',
      getContentType(targetPath) ?? 'application/octet-stream',
    )
    response.end(fileContents)
    return
  } catch {
    if (pathname !== '/' && !pathname.startsWith('/assets/')) {
      await serveStandaloneAsset('/', standaloneDir, response)
      return
    }
  }

  response.statusCode = 404
  response.end('Not found')
}

function getContentType(pathValue: string) {
  switch (extname(pathValue)) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    default:
      return null
  }
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: codebase-visualizer [path] [--port 3210] [--host 127.0.0.1]',
      '',
      'Starts a local web app that visualizes the target repository.',
    ].join('\n') + '\n',
  )
}

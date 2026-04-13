import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'

import type {
  CodebaseDirectory,
  CodebaseEntry,
  CodebaseFile,
  CodebaseSnapshot,
  ReadProjectSnapshotOptions,
} from '../types'

const DEFAULT_IGNORED_NAMES = new Set([
  '.DS_Store',
  '.git',
  '.idea',
  '.next',
  '.turbo',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
])

const DEFAULT_MAX_DEPTH = 12
const DEFAULT_MAX_FILE_SIZE = 100_000
const DEFAULT_MAX_FILES = 2_000

interface WalkState {
  filesSeen: number
  ignoredNames: Set<string>
  includeContents: boolean
  maxDepth: number
  maxFileSize: number
  maxFiles: number
  rootDir: string
}

export async function readProjectSnapshot(
  options: ReadProjectSnapshotOptions = {},
): Promise<CodebaseSnapshot> {
  const rootDir = options.rootDir ?? process.cwd()
  const state: WalkState = {
    filesSeen: 0,
    ignoredNames: new Set([
      ...DEFAULT_IGNORED_NAMES,
      ...(options.ignoredNames ?? []),
    ]),
    includeContents: options.includeContents ?? true,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxFileSize: options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    rootDir,
  }

  const tree = await walkDirectory(rootDir, state, 0)

  return {
    rootDir,
    generatedAt: new Date().toISOString(),
    totalFiles: state.filesSeen,
    tree,
  }
}

async function walkDirectory(
  directoryPath: string,
  state: WalkState,
  depth: number,
): Promise<CodebaseEntry[]> {
  if (depth > state.maxDepth || state.filesSeen >= state.maxFiles) {
    return []
  }

  const directoryEntries = await readdir(directoryPath, { withFileTypes: true })
  const sortedEntries = directoryEntries
    .filter((entry) => !state.ignoredNames.has(entry.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })

  const tree: CodebaseEntry[] = []

  for (const entry of sortedEntries) {
    if (state.filesSeen >= state.maxFiles) {
      break
    }

    const absolutePath = join(directoryPath, entry.name)
    const relativePath = normalizePath(relative(state.rootDir, absolutePath))

    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      const children = await walkDirectory(absolutePath, state, depth + 1)
      const directoryNode: CodebaseDirectory = {
        kind: 'directory',
        name: entry.name,
        path: relativePath,
        children,
      }

      tree.push(directoryNode)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    state.filesSeen += 1
    tree.push(await readProjectFile(absolutePath, relativePath, state))
  }

  return tree
}

async function readProjectFile(
  absolutePath: string,
  relativePath: string,
  state: WalkState,
): Promise<CodebaseFile> {
  const fileStat = await stat(absolutePath)
  const fileNode: CodebaseFile = {
    kind: 'file',
    name: basename(absolutePath),
    path: relativePath,
    extension: extname(absolutePath).slice(1),
    size: fileStat.size,
    content: null,
  }

  if (!state.includeContents) {
    return fileNode
  }

  if (fileStat.size > state.maxFileSize) {
    fileNode.contentOmittedReason = 'too_large'
    return fileNode
  }

  try {
    const buffer = await readFile(absolutePath)

    if (buffer.includes(0)) {
      fileNode.contentOmittedReason = 'binary'
      return fileNode
    }

    fileNode.content = buffer.toString('utf8')
    return fileNode
  } catch {
    fileNode.contentOmittedReason = 'read_error'
    return fileNode
  }
}

function normalizePath(pathValue: string) {
  return pathValue.split('\\').join('/')
}

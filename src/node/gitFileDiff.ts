import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import type { GitFileDiff, GitFileDiffLineChange } from '../types'

const execFileAsync = promisify(execFile)

export async function getGitFileDiff(
  rootDir: string,
  targetPath: string,
): Promise<GitFileDiff | null> {
  const workspacePath = normalizeWorkspaceRelativePath(rootDir, targetPath)

  if (!workspacePath) {
    return null
  }

  try {
    const isInsideWorkTree = await execGit(rootDir, ['rev-parse', '--is-inside-work-tree'])

    if (isInsideWorkTree.stdout.trim() !== 'true') {
      return null
    }

    const status = await execGit(rootDir, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      workspacePath,
    ])
    const isUntracked = status.stdout
      .split(/\r?\n/)
      .some((line) => line.startsWith('?? '))

    if (isUntracked) {
      return buildUntrackedFileDiff(rootDir, workspacePath)
    }

    const diff = await execGit(rootDir, [
      'diff',
      '--no-ext-diff',
      '--no-color',
      '--unified=0',
      'HEAD',
      '--',
      workspacePath,
    ])

    return parseGitFileDiff(workspacePath, diff.stdout)
  } catch {
    return null
  }
}

async function execGit(rootDir: string, args: string[]) {
  return execFileAsync('git', args, {
    cwd: rootDir,
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function buildUntrackedFileDiff(rootDir: string, workspacePath: string): Promise<GitFileDiff> {
  const absolutePath = resolve(rootDir, workspacePath)
  const content = await readFile(absolutePath, 'utf8').catch(() => '')
  const lineCount = countDocumentLines(content)
  const changes: GitFileDiffLineChange[] =
    lineCount > 0
      ? [
          {
            endLine: lineCount,
            kind: 'added',
            startLine: 1,
          },
        ]
      : []

  return {
    addedLineCount: lineCount,
    baseline: 'HEAD',
    changes,
    deletedLineCount: 0,
    fingerprint: hashGitDiffContent(content),
    hasDiff: lineCount > 0,
    isUntracked: true,
    modifiedLineCount: 0,
    path: workspacePath,
  }
}

export function parseGitFileDiff(path: string, diffText: string): GitFileDiff {
  const changes: GitFileDiffLineChange[] = []
  let addedLineCount = 0
  let modifiedLineCount = 0
  let deletedLineCount = 0
  let currentNewLine = 1
  let pendingRemovedLineCount = 0
  let pendingAddedLineCount = 0
  let pendingAddedStartLine: number | null = null

  const flushPendingChange = () => {
    if (pendingRemovedLineCount > 0 && pendingAddedLineCount > 0 && pendingAddedStartLine !== null) {
      modifiedLineCount += pendingAddedLineCount
      changes.push({
        endLine: pendingAddedStartLine + pendingAddedLineCount - 1,
        kind: 'modified',
        startLine: pendingAddedStartLine,
      })
    } else if (pendingAddedLineCount > 0 && pendingAddedStartLine !== null) {
      addedLineCount += pendingAddedLineCount
      changes.push({
        endLine: pendingAddedStartLine + pendingAddedLineCount - 1,
        kind: 'added',
        startLine: pendingAddedStartLine,
      })
    } else if (pendingRemovedLineCount > 0) {
      deletedLineCount += pendingRemovedLineCount
    }

    pendingRemovedLineCount = 0
    pendingAddedLineCount = 0
    pendingAddedStartLine = null
  }

  for (const line of diffText.split(/\r?\n/)) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)

    if (match) {
      flushPendingChange()
      currentNewLine = Number.parseInt(match[3] ?? '1', 10)
      continue
    }

    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      flushPendingChange()
      continue
    }

    if (line.startsWith('-')) {
      if (pendingAddedLineCount > 0) {
        flushPendingChange()
      }

      pendingRemovedLineCount += 1
      continue
    }

    if (line.startsWith('+')) {
      if (pendingAddedStartLine === null) {
        pendingAddedStartLine = currentNewLine
      }

      pendingAddedLineCount += 1
      currentNewLine += 1
      continue
    }

    if (line.startsWith('\\')) {
      continue
    }

    flushPendingChange()

    if (line.startsWith(' ')) {
      currentNewLine += 1
    }
  }

  flushPendingChange()

  return {
    addedLineCount,
    baseline: 'HEAD',
    changes,
    deletedLineCount,
    fingerprint: hashGitDiffContent(diffText),
    hasDiff: addedLineCount > 0 || modifiedLineCount > 0 || deletedLineCount > 0,
    isUntracked: false,
    modifiedLineCount,
    path,
  }
}

function normalizeWorkspaceRelativePath(rootDir: string, targetPath: string) {
  const normalizedRootDir = resolve(rootDir)
  const absoluteTargetPath = resolve(normalizedRootDir, targetPath)

  if (
    absoluteTargetPath !== normalizedRootDir &&
    !absoluteTargetPath.startsWith(`${normalizedRootDir}${sep}`)
  ) {
    return null
  }

  return relative(normalizedRootDir, absoluteTargetPath).replace(/\\/g, '/')
}

function countDocumentLines(content: string) {
  if (content.length === 0) {
    return 0
  }

  const normalizedContent = content.endsWith('\n') ? content.slice(0, -1) : content

  if (normalizedContent.length === 0) {
    return 1
  }

  return normalizedContent.split(/\r?\n/).length
}

function hashGitDiffContent(content: string) {
  return createHash('sha1').update(content).digest('hex')
}

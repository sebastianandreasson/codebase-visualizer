import type { PreprocessedWorkspaceContext } from './types'

const preprocessingCache = new Map<string, PreprocessedWorkspaceContext>()
const latestSnapshotIdByRootDir = new Map<string, string>()

export function getPreprocessedWorkspaceContext(snapshotId: string) {
  return preprocessingCache.get(snapshotId) ?? null
}

export function setPreprocessedWorkspaceContext(
  snapshotId: string,
  context: PreprocessedWorkspaceContext,
) {
  preprocessingCache.set(snapshotId, context)
  latestSnapshotIdByRootDir.set(context.workspaceProfile.rootDir, snapshotId)
}

export function getLatestPreprocessedWorkspaceContext(rootDir: string) {
  const snapshotId = latestSnapshotIdByRootDir.get(rootDir)

  if (!snapshotId) {
    return null
  }

  return preprocessingCache.get(snapshotId) ?? null
}

export function clearPreprocessedWorkspaceContext(snapshotId?: string) {
  if (snapshotId) {
    const existingContext = preprocessingCache.get(snapshotId)
    preprocessingCache.delete(snapshotId)

    if (existingContext) {
      const latestSnapshotId = latestSnapshotIdByRootDir.get(existingContext.workspaceProfile.rootDir)

      if (latestSnapshotId === snapshotId) {
        latestSnapshotIdByRootDir.delete(existingContext.workspaceProfile.rootDir)
      }
    }

    return
  }

  preprocessingCache.clear()
  latestSnapshotIdByRootDir.clear()
}

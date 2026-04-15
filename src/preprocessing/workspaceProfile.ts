import {
  isDirectoryNode,
  isFileNode,
  isSymbolNode,
  type ProjectSnapshot,
} from '../schema/snapshot'
import type { WorkspaceProfile } from './types'

export function buildWorkspaceProfile(snapshot: ProjectSnapshot): WorkspaceProfile {
  const files = Object.values(snapshot.nodes).filter(isFileNode)
  const symbols = Object.values(snapshot.nodes).filter(isSymbolNode)
  const directories = Object.values(snapshot.nodes).filter(isDirectoryNode)
  const languages = Array.from(
    new Set(
      [...files, ...symbols]
        .map((node) => node.language)
        .filter((language): language is string => Boolean(language)),
    ),
  ).sort()
  const topDirectories = directories
    .filter((directory) => directory.depth <= 2)
    .sort((left, right) => right.childIds.length - left.childIds.length)
    .slice(0, 6)
    .map((directory) => directory.path)
  const notableTags = Array.from(
    new Set(
      files.flatMap((file) => file.tags),
    ),
  ).slice(0, 8)
  const entryFiles = snapshot.entryFileIds
    .map((fileId) => snapshot.nodes[fileId])
    .filter(isFileNode)
    .map((file) => file.path)

  return {
    rootDir: snapshot.rootDir,
    generatedAt: new Date().toISOString(),
    totalFiles: snapshot.totalFiles,
    totalSymbols: symbols.length,
    languages,
    topDirectories,
    entryFiles,
    notableTags,
    summary: buildWorkspaceProfileSummary({
      totalFiles: snapshot.totalFiles,
      totalSymbols: symbols.length,
      languages,
      topDirectories,
      entryFiles,
    }),
  }
}

function buildWorkspaceProfileSummary(input: {
  totalFiles: number
  totalSymbols: number
  languages: string[]
  topDirectories: string[]
  entryFiles: string[]
}) {
  const languagesText =
    input.languages.length > 0 ? input.languages.join(', ') : 'unknown languages'
  const directoriesText =
    input.topDirectories.length > 0 ? input.topDirectories.join(', ') : 'no dominant directories detected'
  const entryFilesText =
    input.entryFiles.length > 0 ? input.entryFiles.join(', ') : 'no entry files detected'

  return `Workspace with ${input.totalFiles} files and ${input.totalSymbols} symbols. Main languages: ${languagesText}. Dominant directories: ${directoriesText}. Likely entry files: ${entryFilesText}.`
}

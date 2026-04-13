export type CodebaseEntryKind = 'directory' | 'file'

export interface CodebaseDirectory {
  kind: 'directory'
  name: string
  path: string
  children: CodebaseEntry[]
}

export interface CodebaseFile {
  kind: 'file'
  name: string
  path: string
  extension: string
  size: number
  content: string | null
  contentOmittedReason?: 'binary' | 'too_large' | 'read_error'
}

export type CodebaseEntry = CodebaseDirectory | CodebaseFile

export interface CodebaseSnapshot {
  rootDir: string
  generatedAt: string
  totalFiles: number
  tree: CodebaseEntry[]
}

export interface ReadProjectSnapshotOptions {
  rootDir?: string
  includeContents?: boolean
  ignoredNames?: string[]
  maxDepth?: number
  maxFileSize?: number
  maxFiles?: number
}

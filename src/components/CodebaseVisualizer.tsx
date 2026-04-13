import { useState } from 'react'

import type { CodebaseEntry, CodebaseFile, CodebaseSnapshot } from '../types'

interface CodebaseVisualizerProps {
  snapshot: CodebaseSnapshot | null
}

export function CodebaseVisualizer({
  snapshot,
}: CodebaseVisualizerProps) {
  const [preferredPath, setPreferredPath] = useState<string | null>(null)

  const files = snapshot ? collectFiles(snapshot.tree) : []
  const selectedPath =
    files.find((file) => file.path === preferredPath)?.path ?? files[0]?.path ?? null
  const selectedFile = files.find((file) => file.path === selectedPath) ?? null

  if (!snapshot) {
    return (
      <section className="cbv-shell">
        <div className="cbv-empty">
          <h2>No codebase loaded</h2>
          <p>Connect a snapshot to render the project tree.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="cbv-shell">
      <aside className="cbv-sidebar">
        <div className="cbv-panel-header">
          <p className="cbv-eyebrow">Project tree</p>
          <strong>{snapshot.totalFiles} files indexed</strong>
        </div>
        <div className="cbv-tree">
          {snapshot.tree.map((entry) => (
            <TreeNode
              depth={0}
              entry={entry}
              key={entry.path}
              selectedPath={selectedFile?.path ?? null}
              setSelectedPath={setPreferredPath}
            />
          ))}
        </div>
      </aside>

      <article className="cbv-preview">
        <div className="cbv-panel-header">
          <p className="cbv-eyebrow">File preview</p>
          <strong>{selectedFile?.path ?? 'No file selected'}</strong>
        </div>
        {selectedFile ? (
          <>
            <div className="cbv-preview-meta">
              <span>{formatFileSize(selectedFile.size)}</span>
              <span>{selectedFile.extension || 'no extension'}</span>
              <span>{describeContentState(selectedFile)}</span>
            </div>
            <pre className="cbv-code">
              <code>{selectedFile.content ?? '// File content unavailable.'}</code>
            </pre>
          </>
        ) : (
          <div className="cbv-empty">
            <h2>No text files found</h2>
            <p>The current snapshot did not produce a readable file preview.</p>
          </div>
        )}
      </article>
    </section>
  )
}

function TreeNode({
  depth,
  entry,
  selectedPath,
  setSelectedPath,
}: {
  depth: number
  entry: CodebaseEntry
  selectedPath: string | null
  setSelectedPath: (path: string) => void
}) {
  if (entry.kind === 'directory') {
    return (
      <div className="cbv-tree-group">
        <div className="cbv-tree-label" style={{ paddingLeft: `${depth * 14}px` }}>
          <span className="cbv-tree-kind">dir</span>
          <span>{entry.name}</span>
        </div>
        {entry.children.map((child) => (
          <TreeNode
            depth={depth + 1}
            entry={child}
            key={child.path}
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
          />
        ))}
      </div>
    )
  }

  const isSelected = entry.path === selectedPath

  return (
    <button
      className={`cbv-tree-file${isSelected ? ' is-selected' : ''}`}
      onClick={() => setSelectedPath(entry.path)}
      style={{ paddingLeft: `${depth * 14}px` }}
      type="button"
    >
      <span className="cbv-tree-kind">file</span>
      <span>{entry.name}</span>
    </button>
  )
}

function collectFiles(entries: CodebaseEntry[]) {
  const files: CodebaseFile[] = []

  for (const entry of entries) {
    if (entry.kind === 'file') {
      files.push(entry)
      continue
    }

    files.push(...collectFiles(entry.children))
  }

  return files
}

function formatFileSize(size: number) {
  if (size < 1_024) {
    return `${size} B`
  }

  if (size < 1_048_576) {
    return `${(size / 1_024).toFixed(1)} KB`
  }

  return `${(size / 1_048_576).toFixed(1)} MB`
}

function describeContentState(file: CodebaseFile) {
  if (file.content) {
    return 'loaded'
  }

  switch (file.contentOmittedReason) {
    case 'binary':
      return 'binary file'
    case 'too_large':
      return 'content capped'
    case 'read_error':
      return 'read failed'
    default:
      return 'metadata only'
  }
}

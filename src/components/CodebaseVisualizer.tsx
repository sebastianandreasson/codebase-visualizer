import { useEffect } from 'react'

import {
  isDirectoryNode,
  isFileNode,
  type CodebaseEntry,
  type CodebaseFile,
  type CodebaseSnapshot,
  type DirectoryNode,
  type FileNode,
} from '../types'
import { useVisualizerStore } from '../store/visualizerStore'

interface CodebaseVisualizerProps {
  snapshot?: CodebaseSnapshot | null
}

export function CodebaseVisualizer({
  snapshot,
}: CodebaseVisualizerProps) {
  const currentSnapshot = useVisualizerStore((state) => state.snapshot)
  const selectedNodeId = useVisualizerStore((state) => state.selection.nodeId)
  const setSnapshot = useVisualizerStore((state) => state.setSnapshot)
  const selectNode = useVisualizerStore((state) => state.selectNode)

  useEffect(() => {
    if (snapshot === undefined) {
      return
    }

    setSnapshot(snapshot)
  }, [setSnapshot, snapshot])

  const effectiveSnapshot = snapshot ?? currentSnapshot
  const files = effectiveSnapshot ? collectFiles(effectiveSnapshot) : []
  const selectedFile =
    files.find((file) => file.id === selectedNodeId) ?? files[0] ?? null

  if (!effectiveSnapshot) {
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
          <strong>{effectiveSnapshot.totalFiles} files indexed</strong>
        </div>
        <div className="cbv-tree">
          {effectiveSnapshot.rootIds.map((rootId) => {
            const entry = effectiveSnapshot.nodes[rootId]

            if (!entry || entry.kind === 'symbol') {
              return null
            }

            return (
            <TreeNode
              depth={0}
              entry={entry}
              key={entry.id}
              nodes={effectiveSnapshot.nodes}
              selectedPath={selectedFile?.id ?? null}
              setSelectedPath={selectNode}
            />
            )
          })}
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
  nodes,
  selectedPath,
  setSelectedPath,
}: {
  depth: number
  entry: CodebaseEntry | DirectoryNode | FileNode
  nodes: CodebaseSnapshot['nodes']
  selectedPath: string | null
  setSelectedPath: (path: string) => void
}) {
  if (isDirectoryNode(entry)) {
    return (
      <div className="cbv-tree-group">
        <div className="cbv-tree-label" style={{ paddingLeft: `${depth * 14}px` }}>
          <span className="cbv-tree-kind">dir</span>
          <span>{entry.name}</span>
        </div>
        {entry.childIds.map((childId) => {
          const child = nodes[childId]

          if (!child || child.kind === 'symbol') {
            return null
          }

          return (
            <TreeNode
              depth={depth + 1}
              entry={child}
              key={child.id}
              nodes={nodes}
              selectedPath={selectedPath}
              setSelectedPath={setSelectedPath}
            />
          )
        })}
      </div>
    )
  }

  const isSelected = entry.id === selectedPath

  return (
    <button
      className={`cbv-tree-file${isSelected ? ' is-selected' : ''}`}
      onClick={() => setSelectedPath(entry.id)}
      style={{ paddingLeft: `${depth * 14}px` }}
      type="button"
    >
      <span className="cbv-tree-kind">file</span>
      <span>{entry.name}</span>
    </button>
  )
}

function collectFiles(snapshot: CodebaseSnapshot) {
  const files: CodebaseFile[] = []

  for (const rootId of snapshot.rootIds) {
    collectFileChildren(rootId, snapshot, files)
  }

  return files
}

function collectFileChildren(
  nodeId: string,
  snapshot: CodebaseSnapshot,
  files: CodebaseFile[],
) {
  const node = snapshot.nodes[nodeId]

  if (!node) {
    return
  }

  if (isFileNode(node)) {
    files.push(node)
    return
  }

  if (!isDirectoryNode(node)) {
    return
  }

  for (const childId of node.childIds) {
    collectFileChildren(childId, snapshot, files)
  }
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

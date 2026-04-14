import { execFile } from 'node:child_process'
import { dirname, extname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import type {
  LanguageAdapter,
  LanguageAdapterInput,
  LanguageAdapterResult,
} from '../../schema/analysis'
import type { FileNode, ProjectSnapshot } from '../../schema/snapshot'

const execFileAsync = promisify(execFile)

const RUST_SOURCE_EXTENSION = '.rs'
const CARGO_MANIFEST_NAME = 'Cargo.toml'

const RUST_TARGET_TAGS = {
  bench: 'bench',
  bin: 'bin',
  'custom-build': 'build_script',
  example: 'example',
  lib: 'lib',
  'proc-macro': 'proc_macro',
  test: 'test',
} as const

type RustTargetTag = (typeof RUST_TARGET_TAGS)[keyof typeof RUST_TARGET_TAGS]

interface CargoMetadata {
  packages: CargoPackage[]
  workspace_members: string[]
  workspace_root: string
}

interface CargoPackage {
  id: string
  manifest_path: string
  name: string
  targets: CargoTarget[]
}

interface CargoTarget {
  kind: string[]
  name: string
  src_path: string
}

export function createRustLanguageAdapter(): LanguageAdapter {
  return {
    id: 'rust',
    displayName: 'Rust / Cargo',
    supports: {
      symbols: false,
      imports: false,
      calls: false,
    },
    matches(fileNode) {
      return (
        extname(fileNode.path).toLowerCase() === RUST_SOURCE_EXTENSION ||
        fileNode.name === CARGO_MANIFEST_NAME
      )
    },
    async analyze({
      snapshot,
      fileNodes,
    }: LanguageAdapterInput): Promise<LanguageAdapterResult> {
      const nodes = { ...snapshot.nodes }
      const rustFileNodes = fileNodes.filter(isRustSourceFile)
      const manifestFileNodes = getCargoManifestFileNodes(snapshot)

      for (const fileNode of rustFileNodes) {
        nodes[fileNode.id] = withNodeTagsAndLanguage(fileNode, [], 'rust')
      }

      for (const manifestFileNode of manifestFileNodes) {
        nodes[manifestFileNode.id] = withNodeTagsAndLanguage(
          manifestFileNode,
          [],
          'toml',
        )
      }

      const fileIdByAbsolutePath = createFileIdByAbsolutePath(snapshot)
      const metadataSets = await loadCargoMetadata(snapshot, manifestFileNodes)
      const entryFileIds = new Set<string>()

      if (metadataSets.length === 0) {
        applyConventionalRustEntrypoints(snapshot, nodes, entryFileIds)

        return {
          nodes,
          entryFileIds: [...entryFileIds],
        }
      }

      for (const metadata of metadataSets) {
        const workspaceMemberIds = new Set(metadata.workspace_members)

        for (const pkg of metadata.packages) {
          const packageRoot = dirname(pkg.manifest_path)
          const isWorkspaceMember = workspaceMemberIds.has(pkg.id)

          for (const fileNode of rustFileNodes) {
            const absolutePath = resolve(snapshot.rootDir, fileNode.path)

            if (!isWithinPath(absolutePath, packageRoot)) {
              continue
            }

            const workspaceTags = isWorkspaceMember ? ['workspace_member'] : []
            nodes[fileNode.id] = withNodeTagsAndLanguage(fileNode, workspaceTags, 'rust')
          }

          const manifestFileId = fileIdByAbsolutePath.get(resolve(pkg.manifest_path))

          if (manifestFileId) {
            const manifestNode = nodes[manifestFileId]

            if (manifestNode?.kind === 'file') {
              const manifestTags = isWorkspaceMember ? ['workspace_member'] : []
              nodes[manifestFileId] = withNodeTagsAndLanguage(
                manifestNode,
                manifestTags,
                'toml',
              )
            }
          }

          for (const target of pkg.targets) {
            const targetFileId = fileIdByAbsolutePath.get(resolve(target.src_path))

            if (!targetFileId) {
              continue
            }

            const targetNode = nodes[targetFileId]

            if (!targetNode || targetNode.kind !== 'file') {
              continue
            }

            const targetTags = new Set<string>()

            if (isWorkspaceMember) {
              targetTags.add('workspace_member')
            }

            targetTags.add('entrypoint')

            for (const targetTag of getRustTargetTags(target.kind)) {
              targetTags.add(targetTag)
            }

            nodes[targetFileId] = withNodeTagsAndLanguage(
              targetNode,
              [...targetTags],
              'rust',
            )
            entryFileIds.add(targetFileId)
          }
        }
      }

      return {
        nodes,
        entryFileIds: [...entryFileIds],
      }
    },
  }
}

function isRustSourceFile(fileNode: FileNode) {
  return extname(fileNode.path).toLowerCase() === RUST_SOURCE_EXTENSION
}

function getCargoManifestFileNodes(snapshot: ProjectSnapshot) {
  return Object.values(snapshot.nodes).filter(
    (node): node is FileNode => node.kind === 'file' && node.name === CARGO_MANIFEST_NAME,
  )
}

function createFileIdByAbsolutePath(snapshot: ProjectSnapshot) {
  const fileIdByAbsolutePath = new Map<string, string>()

  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== 'file') {
      continue
    }

    fileIdByAbsolutePath.set(resolve(snapshot.rootDir, node.path), node.id)
  }

  return fileIdByAbsolutePath
}

async function loadCargoMetadata(
  snapshot: ProjectSnapshot,
  manifestFileNodes: FileNode[],
) {
  const metadataByWorkspaceRoot = new Map<string, CargoMetadata>()

  for (const manifestFileNode of manifestFileNodes.sort(comparePathDepth)) {
    const metadata = await readCargoMetadata(
      snapshot.rootDir,
      resolve(snapshot.rootDir, manifestFileNode.path),
    )

    if (!metadata) {
      continue
    }

    metadataByWorkspaceRoot.set(resolve(metadata.workspace_root), metadata)
  }

  return [...metadataByWorkspaceRoot.values()]
}

function comparePathDepth(left: FileNode, right: FileNode) {
  const leftDepth = left.path.split('/').length
  const rightDepth = right.path.split('/').length

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth
  }

  return left.path.localeCompare(right.path)
}

async function readCargoMetadata(rootDir: string, manifestPath: string) {
  try {
    const { stdout } = await execFileAsync(
      'cargo',
      [
        'metadata',
        '--format-version=1',
        '--no-deps',
        '--manifest-path',
        manifestPath,
      ],
      { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 },
    )

    return JSON.parse(stdout) as CargoMetadata
  } catch {
    return null
  }
}

function applyConventionalRustEntrypoints(
  snapshot: ProjectSnapshot,
  nodes: ProjectSnapshot['nodes'],
  entryFileIds: Set<string>,
) {
  const conventionalTargets: Array<{
    path: string
    tags: string[]
  }> = [
    { path: 'src/lib.rs', tags: ['entrypoint', 'lib'] },
    { path: 'src/main.rs', tags: ['entrypoint', 'bin'] },
    { path: 'build.rs', tags: ['entrypoint', 'build_script'] },
  ]

  for (const target of conventionalTargets) {
    const node = nodes[target.path]

    if (!node || node.kind !== 'file') {
      continue
    }

    nodes[target.path] = withNodeTagsAndLanguage(node, target.tags, 'rust')
    entryFileIds.add(target.path)
  }

  for (const node of Object.values(nodes)) {
    if (!isRustSourceFileNode(node)) {
      continue
    }

    const normalizedPath = relative(snapshot.rootDir, resolve(snapshot.rootDir, node.path))
      .split('\\')
      .join('/')

    if (normalizedPath.startsWith('examples/')) {
      nodes[node.id] = withNodeTagsAndLanguage(node, ['entrypoint', 'example'], 'rust')
      entryFileIds.add(node.id)
    } else if (normalizedPath.startsWith('tests/')) {
      nodes[node.id] = withNodeTagsAndLanguage(node, ['entrypoint', 'test'], 'rust')
      entryFileIds.add(node.id)
    } else if (normalizedPath.startsWith('benches/')) {
      nodes[node.id] = withNodeTagsAndLanguage(node, ['entrypoint', 'bench'], 'rust')
      entryFileIds.add(node.id)
    }
  }
}

function isRustSourceFileNode(node: ProjectSnapshot['nodes'][string]): node is FileNode {
  return node?.kind === 'file' && isRustSourceFile(node)
}

function getRustTargetTags(targetKinds: string[]) {
  const tags = new Set<RustTargetTag>()

  for (const targetKind of targetKinds) {
    const mappedTag = RUST_TARGET_TAGS[targetKind as keyof typeof RUST_TARGET_TAGS]

    if (mappedTag) {
      tags.add(mappedTag)
    }
  }

  return [...tags]
}

function withNodeTagsAndLanguage(
  fileNode: FileNode,
  nextTags: string[],
  language: string,
): FileNode {
  return {
    ...fileNode,
    language,
    tags: [...new Set([...fileNode.tags, ...nextTags])],
  }
}

function isWithinPath(candidatePath: string, parentPath: string) {
  const relativePath = relative(parentPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('../'))
}

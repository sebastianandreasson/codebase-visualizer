import type { SemanticEmbeddingProvider } from '../types'

export interface LocalSemanticEmbeddingProviderOptions {
  modelId: string
  embedTexts: (input: { id: string; text: string }[]) => Promise<Record<string, number[]>>
}

const DEFAULT_VECTOR_DIMENSIONS = 96

export function createLocalSemanticEmbeddingProvider(
  options: LocalSemanticEmbeddingProviderOptions,
): SemanticEmbeddingProvider {
  return {
    id: options.modelId,
    kind: 'local',
    embedTexts: options.embedTexts,
  }
}

export function embedTextsLocally(
  input: { id: string; text: string }[],
  dimensions: number = DEFAULT_VECTOR_DIMENSIONS,
) {
  const embeddings: Record<string, number[]> = {}

  for (const item of input) {
    const vector = new Array<number>(dimensions).fill(0)
    const tokens = tokenizeSemanticText(item.text)

    for (const token of tokens) {
      const weight = token.length > 2 ? 1 : 0.35
      const index = hashToken(token) % dimensions
      vector[index] += weight
    }

    embeddings[item.id] = normalizeVector(vector)
  }

  return embeddings
}

function tokenizeSemanticText(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_/.:-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function hashToken(token: string) {
  let hash = 5381

  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash << 5) + hash) ^ token.charCodeAt(index)
  }

  return Math.abs(hash >>> 0)
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))

  if (magnitude === 0) {
    return vector
  }

  return vector.map((value) => value / magnitude)
}

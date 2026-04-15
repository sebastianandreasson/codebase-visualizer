const DEFAULT_VECTOR_DIMENSIONS = 192
const MAX_VOCABULARY_SIZE = 1024

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'if',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'with',
])

export function embedTextsWithTfidf(
  input: { id: string; text: string }[],
  dimensions: number = DEFAULT_VECTOR_DIMENSIONS,
) {
  const tokenizedDocuments = input.map((item) => tokenizeText(item.text))
  const documentFrequency = new Map<string, number>()

  for (const tokens of tokenizedDocuments) {
    const uniqueTokens = new Set(tokens)

    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }

  const rankedVocabulary = Array.from(documentFrequency.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return left[0].localeCompare(right[0])
    })
    .slice(0, MAX_VOCABULARY_SIZE)
    .map(([token]) => token)
  const vocabulary = new Set(rankedVocabulary)
  const documentCount = Math.max(1, input.length)
  const embeddings: Record<string, number[]> = {}

  input.forEach((item, index) => {
    const tokens = tokenizedDocuments[index]
    const termFrequency = new Map<string, number>()

    for (const token of tokens) {
      if (!vocabulary.has(token)) {
        continue
      }

      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1)
    }

    const vector = new Array<number>(dimensions).fill(0)

    for (const [token, count] of termFrequency) {
      const df = documentFrequency.get(token) ?? 1
      const tfidf = (1 + Math.log(count)) * (Math.log((1 + documentCount) / (1 + df)) + 1)
      const positiveIndex = hashToken(`${token}:pos`) % dimensions
      const negativeIndex = hashToken(`${token}:neg`) % dimensions

      vector[positiveIndex] += tfidf
      vector[negativeIndex] -= tfidf * 0.5
    }

    embeddings[item.id] = normalizeVector(vector)
  })

  return embeddings
}

function tokenizeText(text: string) {
  const normalized = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_/.:\\-]+/g, ' ')
    .toLowerCase()

  const rawTokens = normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  const tokens: string[] = []

  for (const token of rawTokens) {
    if (token.length < 2 || STOPWORDS.has(token)) {
      continue
    }

    tokens.push(token)

    if (token.length >= 5) {
      for (let index = 0; index <= token.length - 3; index += 1) {
        tokens.push(`tri:${token.slice(index, index + 3)}`)
      }
    }
  }

  return tokens
}

function hashToken(token: string) {
  let hash = 2166136261

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
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

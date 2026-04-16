import type { SemanticEmbeddingVectorRecord } from '../semantic/types'

const DEFAULT_EMBEDDING_MODEL_ID = 'nomic-ai/nomic-embed-text-v1.5'

type FeatureExtractor = (
  input: string | string[],
  options?: Record<string, unknown>,
) => Promise<
  | { data?: Float32Array | number[]; dims?: number[] }
  | Array<{ data?: Float32Array | number[]; dims?: number[] }>
>

let cachedExtractorPromise: Promise<FeatureExtractor> | null = null

export async function embedSemanticTexts(input: {
  modelId?: string
  texts: {
    id: string
    text: string
    textHash: string
  }[]
}): Promise<SemanticEmbeddingVectorRecord[]> {
  const texts = input.texts.filter((item) => item.text.trim().length > 0)

  if (texts.length === 0) {
    return []
  }

  const modelId = input.modelId ?? DEFAULT_EMBEDDING_MODEL_ID
  const extractor = await getFeatureExtractor(modelId)
  const generatedAt = new Date().toISOString()
  const prefixedTexts = texts.map((item) => `clustering: ${item.text}`)
  const output = await extractor(prefixedTexts, {
    pooling: 'mean',
    normalize: true,
  })
  const rows = Array.isArray(output) ? output : [output]

  return texts.map((item, index) => {
    const row = rows[index]
    const values = toNumberArray(row?.data)

    return {
      symbolId: item.id,
      modelId,
      dimensions: values.length,
      textHash: item.textHash,
      values,
      generatedAt,
    }
  })
}

async function getFeatureExtractor(modelId: string) {
  if (!cachedExtractorPromise) {
    cachedExtractorPromise = loadTransformersModule().then(async ({ env, pipeline }) => {
      env.allowLocalModels = true
      env.allowRemoteModels = true
      return pipeline('feature-extraction', modelId)
    }) as Promise<FeatureExtractor>
  }

  return cachedExtractorPromise
}

function loadTransformersModule() {
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<{
    env: {
      allowLocalModels: boolean
      allowRemoteModels: boolean
    }
    pipeline: (
      task: string,
      modelId: string,
    ) => Promise<FeatureExtractor>
  }>

  return dynamicImport('@huggingface/transformers')
}

function toNumberArray(input: Float32Array | number[] | undefined) {
  if (!input) {
    return []
  }

  return Array.from(input)
}

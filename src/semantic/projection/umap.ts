import type { SemanticProjectionPoint, SemanticProjectionRecord, SemanticUmapInput } from '../types'

export function projectSemanticEmbeddings(
  input: SemanticUmapInput,
): SemanticProjectionRecord {
  const axisX = buildDeterministicAxis(
    input.vectors[0]?.dimensions ?? 0,
    input.seed ^ 0x9e3779b9,
  )
  const axisY = buildDeterministicAxis(
    input.vectors[0]?.dimensions ?? 0,
    input.seed ^ 0x7f4a7c15,
  )

  const rawPoints = input.vectors.map((vector): SemanticProjectionPoint => ({
    symbolId: vector.symbolId,
    x: dotProduct(vector.values, axisX),
    y: dotProduct(vector.values, axisY),
  }))
  const points = normalizeProjection(rawPoints)

  return {
    id: `semantic-projection:${input.seed}:${input.vectors.length}`,
    modelId: input.vectors[0]?.modelId ?? 'unknown',
    symbolIds: input.vectors.map((vector) => vector.symbolId),
    points,
    seed: input.seed,
    generatedAt: new Date().toISOString(),
  }
}

function buildDeterministicAxis(dimensions: number, seed: number) {
  const axis = new Array<number>(dimensions)
  let value = seed >>> 0

  for (let index = 0; index < dimensions; index += 1) {
    value = nextSeed(value)
    axis[index] = ((value / 0xffffffff) * 2) - 1
  }

  return normalizeAxis(axis)
}

function normalizeAxis(axis: number[]) {
  const magnitude = Math.sqrt(axis.reduce((sum, value) => sum + value * value, 0))

  if (magnitude === 0) {
    return axis
  }

  return axis.map((value) => value / magnitude)
}

function dotProduct(left: number[], right: number[]) {
  let sum = 0

  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * (right[index] ?? 0)
  }

  return sum
}

function nextSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0
}

function normalizeProjection(points: SemanticProjectionPoint[]) {
  if (points.length === 0) {
    return points
  }

  const xValues = points.map((point) => point.x)
  const yValues = points.map((point) => point.y)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  const xRange = Math.max(1e-6, maxX - minX)
  const yRange = Math.max(1e-6, maxY - minY)

  return points.map((point) => ({
    symbolId: point.symbolId,
    x: ((point.x - minX) / xRange) * 3200,
    y: ((point.y - minY) / yRange) * 2200,
  }))
}

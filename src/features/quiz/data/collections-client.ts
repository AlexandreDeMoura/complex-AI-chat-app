import type { QuizCollectionSummary } from '@/features/quiz/model'
import {
  QuizApiError,
  createAuthorizedJsonHeaders,
  parseQuizApiError,
} from '@/features/quiz/data/quiz-request'

interface ListCollectionsApiResponse {
  collections?: unknown
}

interface CreateCollectionApiResponse {
  collection?: unknown
}

interface CreateQuizCollectionParams {
  accessToken: string
  name: string
  description?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCollectionPayload(value: unknown): QuizCollectionSummary {
  if (!isRecord(value)) {
    throw new QuizApiError('Collection response payload is invalid.', 502)
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const description = typeof value.description === 'string'
    ? value.description.trim()
    : value.description === null
      ? null
      : null
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt.trim() : ''
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt.trim() : ''
  const questionCount = typeof value.questionCount === 'number' && Number.isInteger(value.questionCount)
    ? value.questionCount
    : NaN

  if (!id || !name || !createdAt || !updatedAt || Number.isNaN(questionCount) || questionCount < 0) {
    throw new QuizApiError('Collection response payload is missing expected fields.', 502)
  }

  return {
    id,
    name,
    description,
    questionCount,
    createdAt,
    updatedAt,
  }
}

export async function listQuizCollections(accessToken: string): Promise<QuizCollectionSummary[]> {
  const response = await fetch('/api/quiz/collections', {
    method: 'GET',
    headers: createAuthorizedJsonHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to load quiz collections.')
  }

  let payload: ListCollectionsApiResponse
  try {
    payload = (await response.json()) as ListCollectionsApiResponse
  } catch {
    throw new QuizApiError('Collections response is not valid JSON.', 502)
  }

  if (!Array.isArray(payload.collections)) {
    throw new QuizApiError('Collections response is missing the collection list.', 502)
  }

  return payload.collections.map((collection) => normalizeCollectionPayload(collection))
}

export async function createQuizCollection({
  accessToken,
  name,
  description,
}: CreateQuizCollectionParams): Promise<QuizCollectionSummary> {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new QuizApiError('Collection name is required.', 400)
  }

  const normalizedDescription = typeof description === 'string'
    ? description.trim() || null
    : description ?? null

  const response = await fetch('/api/quiz/collections', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      name: trimmedName,
      description: normalizedDescription,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to create quiz collection.')
  }

  let payload: CreateCollectionApiResponse
  try {
    payload = (await response.json()) as CreateCollectionApiResponse
  } catch {
    throw new QuizApiError('Create collection response is not valid JSON.', 502)
  }

  return normalizeCollectionPayload(payload.collection)
}

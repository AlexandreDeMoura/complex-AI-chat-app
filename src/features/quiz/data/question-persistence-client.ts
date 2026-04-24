import type { QuizQuestion } from '@/features/quiz/model'
import {
  QuizApiError,
  createAuthorizedJsonHeaders,
  parseQuizApiError,
} from '@/features/quiz/data/quiz-request'

interface PersistQuizQuestionsBulkParams {
  accessToken: string
  questions: QuizQuestion[]
  collectionNameOverrides?: Record<string, string>
  mergeIntoCollectionId?: string
}

interface PersistQuizQuestionsBulkApiResponse {
  userId?: unknown
  questionIds?: unknown
  collectionIds?: unknown
}

export interface PersistQuizQuestionsBulkResult {
  questionIds: string[]
  collectionIds: string[]
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  const normalized: string[] = []

  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const trimmedValue = value.trim()
    if (!trimmedValue) {
      continue
    }

    normalized.push(trimmedValue)
  }

  return normalized
}

export async function persistQuizQuestionsBulk({
  accessToken,
  questions,
  collectionNameOverrides,
  mergeIntoCollectionId,
}: PersistQuizQuestionsBulkParams): Promise<PersistQuizQuestionsBulkResult> {
  const normalizedMergeIntoCollectionId =
    typeof mergeIntoCollectionId === 'string' ? mergeIntoCollectionId.trim() : ''

  const normalizedCollectionNameOverrides =
    collectionNameOverrides && typeof collectionNameOverrides === 'object'
      ? Object.fromEntries(
        Object.entries(collectionNameOverrides)
          .map(([subject, collectionName]) => [subject.trim(), collectionName.trim()] as const)
          .filter(([subject, collectionName]) => subject.length > 0 && collectionName.length > 0),
      )
      : null

  const requestPayload: Record<string, unknown> = { questions }

  if (normalizedMergeIntoCollectionId) {
    requestPayload.merge_into_collection_id = normalizedMergeIntoCollectionId
  } else if (normalizedCollectionNameOverrides && Object.keys(normalizedCollectionNameOverrides).length > 0) {
    requestPayload.collection_name_overrides = normalizedCollectionNameOverrides
  }

  const response = await fetch('/api/quiz/questions/bulk', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify(requestPayload),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Quiz question persistence failed.')
  }

  let responsePayload: PersistQuizQuestionsBulkApiResponse

  try {
    responsePayload = (await response.json()) as PersistQuizQuestionsBulkApiResponse
  } catch {
    throw new QuizApiError('Quiz persistence response is invalid.', 502)
  }

  const userId = typeof responsePayload.userId === 'string' ? responsePayload.userId.trim() : ''
  const questionIds = normalizeStringList(responsePayload.questionIds)
  const collectionIds = normalizeStringList(responsePayload.collectionIds)

  if (!userId || questionIds.length === 0 || collectionIds.length === 0) {
    throw new QuizApiError('Quiz persistence response is missing expected identifiers.', 502)
  }

  return {
    questionIds,
    collectionIds,
  }
}

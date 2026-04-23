import type { QuizQuestion } from '@/features/quiz/model'
import {
  QuizApiError,
  createAuthorizedJsonHeaders,
  parseQuizApiError,
} from '@/features/quiz/data/quiz-request'

interface PersistQuizQuestionsBulkParams {
  accessToken: string
  questions: QuizQuestion[]
}

interface PersistQuizQuestionsBulkApiResponse {
  userId?: unknown
  questionIds?: unknown
  collectionIds?: unknown
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
}: PersistQuizQuestionsBulkParams): Promise<void> {
  const response = await fetch('/api/quiz/questions/bulk', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({ questions }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Quiz question persistence failed.')
  }

  let payload: PersistQuizQuestionsBulkApiResponse

  try {
    payload = (await response.json()) as PersistQuizQuestionsBulkApiResponse
  } catch {
    throw new QuizApiError('Quiz persistence response is invalid.', 502)
  }

  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : ''
  const questionIds = normalizeStringList(payload.questionIds)
  const collectionIds = normalizeStringList(payload.collectionIds)

  if (!userId || questionIds.length === 0 || collectionIds.length === 0) {
    throw new QuizApiError('Quiz persistence response is missing expected identifiers.', 502)
  }
}

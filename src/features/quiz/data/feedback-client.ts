import { createAuthorizedJsonHeaders, parseQuizApiError } from '@/features/quiz/data/quiz-request'

interface FetchFeedbackParams {
  accessToken: string
  questionId: string
  question: string
  userAnswer: string
  completeAnswer: string
}

interface FeedbackApiResponse {
  feedback?: unknown
  grade?: unknown
  mastery_level?: unknown
}

export interface FetchFeedbackResult {
  feedback: string
  grade: number | null
  masteryLevel: number
}

function normalizeGrade(value: unknown): number | null {
  if (value === null) {
    return null
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
    throw new Error('Feedback response grade is invalid.')
  }

  return value
}

export async function fetchFeedback({
  accessToken,
  questionId,
  question,
  userAnswer,
  completeAnswer,
}: FetchFeedbackParams): Promise<FetchFeedbackResult> {
  const normalizedQuestionId = questionId.trim()
  if (!normalizedQuestionId) {
    throw new Error('Question id is required to request feedback.')
  }

  const response = await fetch('/api/quiz/feedback', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      question_id: normalizedQuestionId,
      question,
      user_answer: userAnswer,
      complete_answer: completeAnswer,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Feedback request failed.')
  }

  const payload = (await response.json()) as FeedbackApiResponse
  const feedback = typeof payload.feedback === 'string' ? payload.feedback.trim() : ''
  const masteryLevel = payload.mastery_level
  const grade = normalizeGrade(payload.grade)

  if (!feedback) {
    throw new Error('Feedback response is missing.')
  }

  if (typeof masteryLevel !== 'number' || !Number.isInteger(masteryLevel) || masteryLevel < 0 || masteryLevel > 5) {
    throw new Error('Feedback response mastery level is invalid.')
  }

  return {
    feedback,
    grade,
    masteryLevel,
  }
}

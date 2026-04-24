import { createAuthorizedJsonHeaders, parseQuizApiError } from '@/features/quiz/data/quiz-request'

interface SubmitMcqAnswerParams {
  accessToken: string
  questionId: string
  userAnswer: string
  isCorrect: boolean
}

interface SubmitMcqAnswerApiResponse {
  mastery_level?: unknown
}

export interface SubmitMcqAnswerResult {
  masteryLevel: number
}

export async function submitMcqAnswer({
  accessToken,
  questionId,
  userAnswer,
  isCorrect,
}: SubmitMcqAnswerParams): Promise<SubmitMcqAnswerResult> {
  const normalizedQuestionId = questionId.trim()
  if (!normalizedQuestionId) {
    throw new Error('Question id is required to submit an MCQ answer.')
  }

  const normalizedUserAnswer = userAnswer.trim()
  if (!normalizedUserAnswer) {
    throw new Error('User answer is required to submit an MCQ answer.')
  }

  const response = await fetch('/api/quiz/answers', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      question_id: normalizedQuestionId,
      mode: 'mcq',
      user_answer: normalizedUserAnswer,
      is_correct: isCorrect,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'MCQ answer persistence failed.')
  }

  const payload = (await response.json()) as SubmitMcqAnswerApiResponse
  const masteryLevel = payload.mastery_level

  if (typeof masteryLevel !== 'number' || !Number.isInteger(masteryLevel) || masteryLevel < 0 || masteryLevel > 5) {
    throw new Error('MCQ answer response mastery level is invalid.')
  }

  return { masteryLevel }
}

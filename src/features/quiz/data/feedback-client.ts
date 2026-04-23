import { createAuthorizedJsonHeaders, parseQuizApiError } from '@/features/quiz/data/quiz-request'

interface FetchFeedbackParams {
  accessToken: string
  question: string
  userAnswer: string
  completeAnswer: string
}

interface FeedbackApiResponse {
  feedback: string
}

export async function fetchFeedback({
  accessToken,
  question,
  userAnswer,
  completeAnswer,
}: FetchFeedbackParams): Promise<string> {
  const response = await fetch('/api/quiz/feedback', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      question,
      user_answer: userAnswer,
      complete_answer: completeAnswer,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Feedback request failed.')
  }

  const payload = (await response.json()) as FeedbackApiResponse
  const feedback = payload.feedback?.trim()

  if (!feedback) {
    throw new Error('Feedback response is missing.')
  }

  return feedback
}

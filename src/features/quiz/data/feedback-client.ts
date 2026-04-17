interface FetchFeedbackParams {
  question: string
  userAnswer: string
  completeAnswer: string
}

interface FeedbackApiResponse {
  feedback: string
}

interface FeedbackApiError {
  error?: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function fetchFeedback({
  question,
  userAnswer,
  completeAnswer,
}: FetchFeedbackParams): Promise<string> {
  const response = await fetch('/api/quiz/feedback', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      question,
      user_answer: userAnswer,
      complete_answer: completeAnswer,
    }),
  })

  if (!response.ok) {
    throw new Error(await parseFeedbackError(response))
  }

  const payload = (await response.json()) as FeedbackApiResponse
  const feedback = payload.feedback?.trim()

  if (!feedback) {
    throw new Error('Feedback response is missing.')
  }

  return feedback
}

async function parseFeedbackError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as FeedbackApiError
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error
    }
  } catch {
    // Ignore JSON parse failures and fall back to a generic status message.
  }

  return `Feedback request failed with status ${response.status}.`
}

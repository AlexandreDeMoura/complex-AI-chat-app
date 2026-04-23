interface QuizApiErrorPayload {
  error?: string
}

export class QuizApiError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'QuizApiError'
    this.statusCode = statusCode
  }
}

export function createAuthorizedJsonHeaders(accessToken: string): HeadersInit {
  const token = accessToken.trim()
  if (!token) {
    throw new QuizApiError('Unauthorized.', 401)
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export async function parseQuizApiError(
  response: Response,
  fallbackMessage: string,
): Promise<QuizApiError> {
  try {
    const payload = (await response.json()) as QuizApiErrorPayload
    const errorMessage = typeof payload.error === 'string' ? payload.error.trim() : ''
    if (errorMessage) {
      return new QuizApiError(errorMessage, response.status)
    }
  } catch {}

  return new QuizApiError(`${fallbackMessage} (status ${response.status}).`, response.status)
}

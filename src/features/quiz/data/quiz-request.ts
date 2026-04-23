interface QuizApiErrorPayload {
  error?: string
  details?: unknown
}

export class QuizApiError extends Error {
  statusCode: number
  details: unknown

  constructor(message: string, statusCode: number, details: unknown = null) {
    super(message)
    this.name = 'QuizApiError'
    this.statusCode = statusCode
    this.details = details
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
    const details = payload.details ?? null
    if (errorMessage) {
      return new QuizApiError(errorMessage, response.status, details)
    }
  } catch {}

  return new QuizApiError(`${fallbackMessage} (status ${response.status}).`, response.status)
}

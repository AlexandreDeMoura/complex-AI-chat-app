import { z } from 'zod'

export const quizGradingSchema = z
  .object({
    feedback: z.string().trim().min(1),
    grade: z.number().int().min(0).max(5),
  })
  .strict()

export class QuizGradingParseError extends Error {
  constructor(message, { cause, rawResponse, details } = {}) {
    super(message, { cause })
    this.name = 'QuizGradingParseError'
    this.rawResponse = rawResponse ?? null
    this.details = details ?? null
  }
}

const addCandidate = (candidates, seen, value) => {
  if (typeof value !== 'string') {
    return
  }

  const trimmed = value.trim()
  if (!trimmed || seen.has(trimmed)) {
    return
  }

  seen.add(trimmed)
  candidates.push(trimmed)
}

const unwrapSingleMarkdownFence = (value) => {
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (!match) {
    return null
  }

  return match[1]
}

const extractJsonObjectSlice = (value) => {
  const firstBraceIndex = value.indexOf('{')
  const lastBraceIndex = value.lastIndexOf('}')

  if (firstBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
    return null
  }

  return value.slice(firstBraceIndex, lastBraceIndex + 1)
}

const buildJsonCandidates = (rawResponse) => {
  const candidates = []
  const seen = new Set()

  addCandidate(candidates, seen, rawResponse)

  const unwrappedFence = unwrapSingleMarkdownFence(rawResponse)
  addCandidate(candidates, seen, unwrappedFence)

  addCandidate(candidates, seen, extractJsonObjectSlice(rawResponse))

  if (typeof unwrappedFence === 'string') {
    addCandidate(candidates, seen, extractJsonObjectSlice(unwrappedFence))
  }

  return candidates
}

export const parseQuizGradingResponse = (rawResponse) => {
  if (typeof rawResponse !== 'string' || rawResponse.trim().length === 0) {
    throw new QuizGradingParseError('Quiz grading response is empty.', {
      rawResponse,
    })
  }

  const candidates = buildJsonCandidates(rawResponse)
  const failureDetails = []

  for (const candidate of candidates) {
    try {
      const parsedCandidate = JSON.parse(candidate)
      const validated = quizGradingSchema.safeParse(parsedCandidate)
      if (validated.success) {
        return validated.data
      }

      failureDetails.push({
        candidate,
        issue: 'schema_validation_failed',
      })
    } catch (error) {
      failureDetails.push({
        candidate,
        issue: 'json_parse_failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  throw new QuizGradingParseError('Quiz grading response is not valid JSON grading output.', {
    rawResponse,
    details: {
      attempts: failureDetails,
    },
  })
}

const normalizeFallbackFeedback = (rawResponse) => {
  if (typeof rawResponse !== 'string') {
    return ''
  }

  return rawResponse.trim()
}

export const parseQuizGradingResponseWithSingleRetry = ({ initialResponse, retryResponse }) => {
  try {
    return parseQuizGradingResponse(initialResponse)
  } catch (initialError) {
    try {
      return parseQuizGradingResponse(retryResponse)
    } catch (retryError) {
      const fallbackFeedback =
        normalizeFallbackFeedback(retryResponse) || normalizeFallbackFeedback(initialResponse)

      if (!fallbackFeedback) {
        throw new QuizGradingParseError('Quiz grading parsing failed and no fallback feedback is available.', {
          cause: retryError,
          details: {
            initialError: initialError instanceof Error ? initialError.message : String(initialError),
            retryError: retryError instanceof Error ? retryError.message : String(retryError),
          },
        })
      }

      return {
        feedback: fallbackFeedback,
        grade: null,
      }
    }
  }
}


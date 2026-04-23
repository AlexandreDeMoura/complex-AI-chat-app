import { createSupabaseRequestClient } from './supabase.js'

const BULK_INSERT_RPC_NAME = 'bulk_insert_quiz_questions'

export class QuizQuestionRepositoryError extends Error {
  constructor(message, { statusCode = 500, cause, details = null } = {}) {
    super(message, { cause })
    this.name = 'QuizQuestionRepositoryError'
    this.statusCode = statusCode
    this.details = details
  }
}

const extractSupabaseErrorDetails = (error) => {
  if (!error || typeof error !== 'object') {
    return null
  }

  const details = {}
  for (const field of ['code', 'message', 'details', 'hint']) {
    const value = error[field]
    if (typeof value === 'string' && value.trim()) {
      details[field] = value
    }
  }

  return Object.keys(details).length > 0 ? details : null
}

const normalizeUuidList = (values) => {
  const output = []
  const seen = new Set()

  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    output.push(normalized)
  }

  return output
}

export const persistBulkQuestions = async ({ accessToken, questions }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase.rpc(BULK_INSERT_RPC_NAME, {
    p_questions: questions,
  })

  if (error) {
    const details = extractSupabaseErrorDetails(error)
    const statusCode = error.code === '42501' ? 401 : 500
    const message = details?.message
      ? `Failed to persist quiz questions in bulk: ${details.message}`
      : 'Failed to persist quiz questions in bulk.'
    throw new QuizQuestionRepositoryError(message, {
      statusCode,
      cause: error,
      details,
    })
  }

  if (!Array.isArray(data)) {
    throw new QuizQuestionRepositoryError('Unexpected response while persisting quiz questions.', {
      statusCode: 502,
      details: { receivedType: data === null ? 'null' : typeof data },
    })
  }

  const questionIds = normalizeUuidList(data.map((row) => row?.question_id))
  const collectionIds = normalizeUuidList(data.map((row) => row?.collection_id))

  if (questionIds.length === 0) {
    throw new QuizQuestionRepositoryError('Quiz question persistence returned no inserted rows.', {
      statusCode: 502,
      details: { rowsReturned: data.length },
    })
  }

  return {
    questionIds,
    collectionIds,
  }
}

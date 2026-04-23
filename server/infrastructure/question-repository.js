import { createSupabaseRequestClient } from './supabase.js'

const BULK_INSERT_RPC_NAME = 'bulk_insert_quiz_questions'

export class QuizQuestionRepositoryError extends Error {
  constructor(message, { statusCode = 500, cause } = {}) {
    super(message, { cause })
    this.name = 'QuizQuestionRepositoryError'
    this.statusCode = statusCode
  }
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
    const statusCode = error.code === '42501' ? 401 : 500
    throw new QuizQuestionRepositoryError('Failed to persist quiz questions in bulk.', {
      statusCode,
      cause: error,
    })
  }

  if (!Array.isArray(data)) {
    throw new QuizQuestionRepositoryError('Unexpected response while persisting quiz questions.', {
      statusCode: 502,
    })
  }

  const questionIds = normalizeUuidList(data.map((row) => row?.question_id))
  const collectionIds = normalizeUuidList(data.map((row) => row?.collection_id))

  if (questionIds.length === 0) {
    throw new QuizQuestionRepositoryError('Quiz question persistence returned no inserted rows.', {
      statusCode: 502,
    })
  }

  return {
    questionIds,
    collectionIds,
  }
}

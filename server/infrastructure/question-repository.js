import { createSupabaseRequestClient } from './supabase.js'

const BULK_INSERT_RPC_NAME = 'bulk_insert_quiz_questions'

const POSTGRES_UNIQUE_VIOLATION = '23505'
const POSTGRES_RLS_VIOLATION = '42501'
const PGRST_NO_ROWS = 'PGRST116'

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

const normalizeOptionalText = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const mapCollectionRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const extractQuestionCount = (row) => {
  const relation = row?.collection_questions
  if (Array.isArray(relation) && relation.length > 0) {
    const count = relation[0]?.count
    return typeof count === 'number' ? count : 0
  }
  return 0
}

const throwFromCollectionError = (error, { fallbackMessage, duplicateMessage }) => {
  const details = extractSupabaseErrorDetails(error)

  if (error?.code === POSTGRES_UNIQUE_VIOLATION) {
    throw new QuizQuestionRepositoryError(duplicateMessage, {
      statusCode: 409,
      cause: error,
      details,
    })
  }

  if (error?.code === POSTGRES_RLS_VIOLATION) {
    throw new QuizQuestionRepositoryError(fallbackMessage, {
      statusCode: 401,
      cause: error,
      details,
    })
  }

  throw new QuizQuestionRepositoryError(fallbackMessage, {
    statusCode: 500,
    cause: error,
    details,
  })
}

export const listCollectionsWithCounts = async ({ accessToken }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, description, created_at, updated_at, collection_questions(count)')
    .order('created_at', { ascending: true })

  if (error) {
    throwFromCollectionError(error, {
      fallbackMessage: 'Failed to list quiz collections.',
      duplicateMessage: 'Failed to list quiz collections.',
    })
  }

  return (data ?? []).map((row) => ({
    ...mapCollectionRow(row),
    questionCount: extractQuestionCount(row),
  }))
}

export const createCollection = async ({ accessToken, userId, name, description }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const payload = {
    user_id: userId,
    name,
    description: normalizeOptionalText(description) ?? null,
  }

  const { data, error } = await supabase
    .from('collections')
    .insert(payload)
    .select('id, name, description, created_at, updated_at')
    .single()

  if (error) {
    throwFromCollectionError(error, {
      fallbackMessage: 'Failed to create quiz collection.',
      duplicateMessage: 'A collection with this name already exists.',
    })
  }

  return { ...mapCollectionRow(data), questionCount: 0 }
}

export const updateCollection = async ({ accessToken, collectionId, name, description }) => {
  const updates = {}
  if (typeof name === 'string') {
    updates.name = name
  }
  const normalizedDescription = normalizeOptionalText(description)
  if (normalizedDescription !== undefined) {
    updates.description = normalizedDescription
  }

  if (Object.keys(updates).length === 0) {
    throw new QuizQuestionRepositoryError('No collection fields to update.', {
      statusCode: 400,
    })
  }

  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase
    .from('collections')
    .update(updates)
    .eq('id', collectionId)
    .select('id, name, description, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === PGRST_NO_ROWS) {
      throw new QuizQuestionRepositoryError('Collection not found.', {
        statusCode: 404,
        cause: error,
        details: extractSupabaseErrorDetails(error),
      })
    }
    throwFromCollectionError(error, {
      fallbackMessage: 'Failed to update quiz collection.',
      duplicateMessage: 'A collection with this name already exists.',
    })
  }

  return mapCollectionRow(data)
}

export const deleteCollection = async ({ accessToken, collectionId }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase
    .from('collections')
    .delete()
    .eq('id', collectionId)
    .select('id')

  if (error) {
    throwFromCollectionError(error, {
      fallbackMessage: 'Failed to delete quiz collection.',
      duplicateMessage: 'Failed to delete quiz collection.',
    })
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new QuizQuestionRepositoryError('Collection not found.', {
      statusCode: 404,
    })
  }

  return { id: data[0].id }
}

import { createSupabaseRequestClient } from './supabase.js'

const BULK_INSERT_RPC_NAME = 'bulk_insert_quiz_questions'
const DELETE_COLLECTION_WITH_ORPHAN_STRATEGY_RPC_NAME = 'delete_collection_with_orphan_strategy'
const REMOVE_COLLECTION_QUESTION_WITH_ORPHAN_STRATEGY_RPC_NAME =
  'remove_collection_question_with_orphan_strategy'

const POSTGRES_UNIQUE_VIOLATION = '23505'
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503'
const POSTGRES_INVALID_PARAMETER_VALUE = '22023'
const POSTGRES_RLS_VIOLATION = '42501'
const POSTGRES_NO_DATA_FOUND = 'P0002'
const PGRST_NO_ROWS = 'PGRST116'
const PGRST_UNDEFINED_FUNCTION = 'PGRST202'

const ORPHAN_STRATEGIES = new Set(['delete', 'reassign'])

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

const normalizeBulkCollectionNameOverrides = (value) => {
  if (value === null || value === undefined) {
    return null
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new QuizQuestionRepositoryError('"collectionNameOverrides" must be an object map.', {
      statusCode: 400,
    })
  }

  const normalized = {}

  for (const [rawSubject, rawCollectionName] of Object.entries(value)) {
    const subject = rawSubject.trim()
    if (!subject) {
      continue
    }

    if (typeof rawCollectionName !== 'string') {
      throw new QuizQuestionRepositoryError(
        'Each collection override value must be a non-empty string.',
        {
          statusCode: 400,
          details: { subject },
        },
      )
    }

    const collectionName = rawCollectionName.trim()
    if (!collectionName) {
      continue
    }

    normalized[subject] = collectionName
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

const normalizeOptionalUuidInput = (value, { field }) => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    throw new QuizQuestionRepositoryError(`"${field}" must be a UUID string.`, {
      statusCode: 400,
    })
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  return normalized
}

const normalizeRequiredText = (value, { field }) => {
  if (typeof value !== 'string') {
    throw new QuizQuestionRepositoryError(`"${field}" must be a non-empty string.`, {
      statusCode: 400,
    })
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new QuizQuestionRepositoryError(`"${field}" must be a non-empty string.`, {
      statusCode: 400,
    })
  }

  return trimmed
}

const normalizeOrphanStrategy = (value) => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    throw new QuizQuestionRepositoryError('Invalid orphan strategy.', {
      statusCode: 400,
      details: { expected: ['delete', 'reassign'] },
    })
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (!ORPHAN_STRATEGIES.has(normalized)) {
    throw new QuizQuestionRepositoryError('Invalid orphan strategy.', {
      statusCode: 400,
      details: { expected: ['delete', 'reassign'], received: normalized },
    })
  }

  return normalized
}

const clampSearchLimit = (value) => {
  if (value === undefined || value === null) {
    return 50
  }

  if (!Number.isInteger(value)) {
    throw new QuizQuestionRepositoryError('Search limit must be an integer.', {
      statusCode: 400,
    })
  }

  if (value < 1) {
    return 1
  }

  if (value > 100) {
    return 100
  }

  return value
}

const escapePostgrestLikeValue = (value) =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')

const buildPostgrestInFilter = (values) =>
  `(${values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(',')})`

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

const extractMasteryLevel = (row) => {
  const relation = row?.mastery_cache
  if (Array.isArray(relation) && relation.length > 0) {
    const masteryLevel = relation[0]?.mastery_level
    return Number.isInteger(masteryLevel) ? masteryLevel : 0
  }

  return 0
}

const mapQuestionRow = (row) => ({
  id: row.id,
  question: row.question,
  mcqQuestion: row.mcq_question,
  completeAnswer: row.complete_answer,
  mcqOptions: Array.isArray(row.mcq_options) ? row.mcq_options : [],
  subject: row.subject,
  difficulty: row.difficulty,
  masteryLevel: extractMasteryLevel(row),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const throwFromSupabaseError = (
  error,
  {
    fallbackMessage,
    duplicateMessage,
    notFoundMessage,
    invalidMessage,
    foreignKeyMessage,
    unauthorizedMessage,
  },
) => {
  const details = extractSupabaseErrorDetails(error)
  const errorMessage = typeof details?.message === 'string' ? details.message.toLowerCase() : ''

  if (error?.code === POSTGRES_UNIQUE_VIOLATION && duplicateMessage) {
    throw new QuizQuestionRepositoryError(duplicateMessage, {
      statusCode: 409,
      cause: error,
      details,
    })
  }

  if (
    error?.code === POSTGRES_NO_DATA_FOUND &&
    foreignKeyMessage &&
    errorMessage.includes('target collection not found')
  ) {
    throw new QuizQuestionRepositoryError(foreignKeyMessage, {
      statusCode: 404,
      cause: error,
      details,
    })
  }

  if ((error?.code === PGRST_NO_ROWS || error?.code === POSTGRES_NO_DATA_FOUND) && notFoundMessage) {
    throw new QuizQuestionRepositoryError(notFoundMessage, {
      statusCode: 404,
      cause: error,
      details,
    })
  }

  if (error?.code === POSTGRES_INVALID_PARAMETER_VALUE && invalidMessage) {
    throw new QuizQuestionRepositoryError(invalidMessage, {
      statusCode: 400,
      cause: error,
      details,
    })
  }

  if (error?.code === POSTGRES_FOREIGN_KEY_VIOLATION && foreignKeyMessage) {
    throw new QuizQuestionRepositoryError(foreignKeyMessage, {
      statusCode: 404,
      cause: error,
      details,
    })
  }

  if (error?.code === POSTGRES_RLS_VIOLATION) {
    throw new QuizQuestionRepositoryError(unauthorizedMessage ?? fallbackMessage, {
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

const isMissingExtendedBulkInsertSignature = (error) => {
  if (!error || error.code !== PGRST_UNDEFINED_FUNCTION) {
    return false
  }

  const details = extractSupabaseErrorDetails(error)
  const message = details?.message?.toLowerCase() ?? ''
  const searchedSignature = details?.details?.toLowerCase() ?? ''

  return (
    message.includes('public.bulk_insert_quiz_questions') &&
    searchedSignature.includes('p_collection_name_overrides') &&
    searchedSignature.includes('p_merge_into_collection_id')
  )
}

const assertCollectionExists = async ({ supabase, collectionId }) => {
  const { data, error } = await supabase.from('collections').select('id').eq('id', collectionId).maybeSingle()

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to load quiz collection.',
      notFoundMessage: 'Collection not found.',
    })
  }

  if (!data?.id) {
    throw new QuizQuestionRepositoryError('Collection not found.', {
      statusCode: 404,
      details: { collectionId },
    })
  }
}

const assertQuestionsExist = async ({ supabase, questionIds }) => {
  const normalizedQuestionIds = normalizeUuidList(questionIds)
  if (normalizedQuestionIds.length === 0) {
    throw new QuizQuestionRepositoryError('At least one question ID is required.', {
      statusCode: 400,
    })
  }

  const { data, error } = await supabase.from('questions').select('id').in('id', normalizedQuestionIds)

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to load quiz questions.',
    })
  }

  const existingQuestionIds = new Set(normalizeUuidList((data ?? []).map((row) => row?.id)))
  const missingQuestionIds = normalizedQuestionIds.filter((questionId) => !existingQuestionIds.has(questionId))

  if (missingQuestionIds.length > 0) {
    throw new QuizQuestionRepositoryError('One or more questions were not found.', {
      statusCode: 404,
      details: { missingQuestionIds },
    })
  }

  return normalizedQuestionIds
}

const normalizeRpcPayload = (data, { fallbackMessage }) => {
  if (Array.isArray(data)) {
    if (data.length === 1 && data[0] && typeof data[0] === 'object') {
      return data[0]
    }

    throw new QuizQuestionRepositoryError(fallbackMessage, {
      statusCode: 502,
      details: { receivedType: 'array', rowsReturned: data.length },
    })
  }

  if (!data || typeof data !== 'object') {
    throw new QuizQuestionRepositoryError(fallbackMessage, {
      statusCode: 502,
      details: { receivedType: data === null ? 'null' : typeof data },
    })
  }

  return data
}

export const persistBulkQuestions = async ({
  accessToken,
  questions,
  collectionNameOverrides,
  mergeIntoCollectionId,
}) => {
  const normalizedMergeIntoCollectionId = normalizeOptionalUuidInput(mergeIntoCollectionId, {
    field: 'mergeIntoCollectionId',
  })
  const normalizedCollectionNameOverrides = normalizedMergeIntoCollectionId
    ? null
    : normalizeBulkCollectionNameOverrides(collectionNameOverrides)

  const supabase = createSupabaseRequestClient(accessToken)
  let { data, error } = await supabase.rpc(BULK_INSERT_RPC_NAME, {
    p_questions: questions,
    p_collection_name_overrides: normalizedCollectionNameOverrides,
    p_merge_into_collection_id: normalizedMergeIntoCollectionId,
  })

  if (error && isMissingExtendedBulkInsertSignature(error)) {
    if (normalizedMergeIntoCollectionId || normalizedCollectionNameOverrides) {
      throw new QuizQuestionRepositoryError(
        'Collection override options require the latest quiz bulk-insert migration.',
        {
          statusCode: 500,
          cause: error,
          details: extractSupabaseErrorDetails(error),
        },
      )
    }

    ;({ data, error } = await supabase.rpc(BULK_INSERT_RPC_NAME, {
      p_questions: questions,
    }))
  }

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to persist quiz questions in bulk.',
      invalidMessage: 'Invalid bulk question persistence options.',
      notFoundMessage: 'Merge target collection not found.',
      unauthorizedMessage: 'Quiz question persistence requires authentication.',
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

export const listCollectionsWithCounts = async ({ accessToken }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, description, created_at, updated_at, collection_questions(count)')
    .order('created_at', { ascending: true })

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to list quiz collections.',
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
    name: normalizeRequiredText(name, { field: 'name' }),
    description: normalizeOptionalText(description) ?? null,
  }

  const { data, error } = await supabase
    .from('collections')
    .insert(payload)
    .select('id, name, description, created_at, updated_at')
    .single()

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to create quiz collection.',
      duplicateMessage: 'A collection with this name already exists.',
    })
  }

  return {
    ...mapCollectionRow(data),
    questionCount: 0,
  }
}

export const updateCollection = async ({ accessToken, collectionId, name, description }) => {
  const updates = {}

  if (typeof name === 'string') {
    updates.name = normalizeRequiredText(name, { field: 'name' })
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
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to update quiz collection.',
      duplicateMessage: 'A collection with this name already exists.',
      notFoundMessage: 'Collection not found.',
    })
  }

  return mapCollectionRow(data)
}

export const deleteCollection = async ({ accessToken, collectionId }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase.from('collections').delete().eq('id', collectionId).select('id')

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to delete quiz collection.',
    })
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new QuizQuestionRepositoryError('Collection not found.', {
      statusCode: 404,
      details: { collectionId },
    })
  }

  return { id: data[0].id }
}

export const deleteCollectionWithOrphanStrategy = async ({
  accessToken,
  collectionId,
  orphanStrategy,
  targetCollectionId,
}) => {
  const normalizedStrategy = normalizeOrphanStrategy(orphanStrategy)
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase.rpc(DELETE_COLLECTION_WITH_ORPHAN_STRATEGY_RPC_NAME, {
    p_collection_id: collectionId,
    p_orphan_strategy: normalizedStrategy,
    p_target_collection_id: targetCollectionId ?? null,
  })

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to delete quiz collection.',
      notFoundMessage: 'Collection not found.',
      invalidMessage: 'Invalid orphan resolution strategy.',
      foreignKeyMessage: 'Target collection not found.',
    })
  }

  const payload = normalizeRpcPayload(data, {
    fallbackMessage: 'Unexpected response while deleting quiz collection.',
  })

  const status = typeof payload.status === 'string' ? payload.status : ''
  const orphanQuestionIds = normalizeUuidList(payload.orphan_question_ids ?? [])

  if (status === 'orphan_conflict') {
    throw new QuizQuestionRepositoryError(
      'Deleting this collection would orphan one or more questions.',
      {
        statusCode: 409,
        details: {
          orphanQuestionIds,
          collectionId,
        },
      },
    )
  }

  if (status !== 'deleted') {
    throw new QuizQuestionRepositoryError('Unexpected response while deleting quiz collection.', {
      statusCode: 502,
      details: payload,
    })
  }

  const deletedCollectionId =
    typeof payload.deleted_collection_id === 'string' ? payload.deleted_collection_id : null

  if (!deletedCollectionId) {
    throw new QuizQuestionRepositoryError('Unexpected response while deleting quiz collection.', {
      statusCode: 502,
      details: payload,
    })
  }

  return {
    id: deletedCollectionId,
    orphanQuestionIds,
    deletedQuestionIds: normalizeUuidList(payload.deleted_question_ids ?? []),
    reassignedQuestionIds: normalizeUuidList(payload.reassigned_question_ids ?? []),
  }
}

export const listCollectionQuestions = async ({ accessToken, collectionId }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  await assertCollectionExists({ supabase, collectionId })

  const { data, error } = await supabase
    .from('questions')
    .select(
      'id, question, mcq_question, complete_answer, mcq_options, subject, difficulty, created_at, updated_at, mastery_cache(mastery_level), collection_questions!inner(collection_id)',
    )
    .eq('collection_questions.collection_id', collectionId)
    .order('created_at', { ascending: true })

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to list collection questions.',
    })
  }

  return (data ?? []).map(mapQuestionRow)
}

export const searchQuestions = async ({ accessToken, search, excludeCollectionId, limit }) => {
  const normalizedLimit = clampSearchLimit(limit)
  const searchTerm = typeof search === 'string' ? search.trim() : ''

  const supabase = createSupabaseRequestClient(accessToken)

  let excludedQuestionIds = []
  if (typeof excludeCollectionId === 'string' && excludeCollectionId.trim()) {
    const collectionId = excludeCollectionId.trim()
    await assertCollectionExists({ supabase, collectionId })

    const { data: links, error: linksError } = await supabase
      .from('collection_questions')
      .select('question_id')
      .eq('collection_id', collectionId)

    if (linksError) {
      throwFromSupabaseError(linksError, {
        fallbackMessage: 'Failed to load collection question links.',
      })
    }

    excludedQuestionIds = normalizeUuidList((links ?? []).map((row) => row?.question_id))
  }

  let query = supabase
    .from('questions')
    .select('id, question, mcq_question, complete_answer, mcq_options, subject, difficulty, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(normalizedLimit)

  if (searchTerm) {
    const escapedSearchTerm = escapePostgrestLikeValue(searchTerm)
    const wildcard = `%${escapedSearchTerm}%`
    query = query.or(`question.ilike.${wildcard},mcq_question.ilike.${wildcard},subject.ilike.${wildcard}`)
  }

  if (excludedQuestionIds.length > 0) {
    query = query.not('id', 'in', buildPostgrestInFilter(excludedQuestionIds))
  }

  const { data, error } = await query

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to search quiz questions.',
    })
  }

  return (data ?? []).map(mapQuestionRow)
}

export const addQuestionsToCollection = async ({ accessToken, collectionId, questionIds }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  await assertCollectionExists({ supabase, collectionId })

  const normalizedQuestionIds = await assertQuestionsExist({
    supabase,
    questionIds,
  })

  const linksToInsert = normalizedQuestionIds.map((questionId) => ({
    collection_id: collectionId,
    question_id: questionId,
  }))

  const { error: upsertError } = await supabase.from('collection_questions').upsert(linksToInsert, {
    onConflict: 'collection_id,question_id',
    ignoreDuplicates: true,
  })

  if (upsertError) {
    throwFromSupabaseError(upsertError, {
      fallbackMessage: 'Failed to link questions to collection.',
      foreignKeyMessage: 'Collection or question not found.',
    })
  }

  const { data: linkedRows, error: linkedRowsError } = await supabase
    .from('collection_questions')
    .select('question_id')
    .eq('collection_id', collectionId)
    .in('question_id', normalizedQuestionIds)

  if (linkedRowsError) {
    throwFromSupabaseError(linkedRowsError, {
      fallbackMessage: 'Failed to verify linked collection questions.',
    })
  }

  return {
    collectionId,
    questionIds: normalizeUuidList((linkedRows ?? []).map((row) => row?.question_id)),
  }
}

export const removeQuestionFromCollection = async ({
  accessToken,
  collectionId,
  questionId,
  orphanStrategy,
  targetCollectionId,
}) => {
  const normalizedStrategy = normalizeOrphanStrategy(orphanStrategy)
  const supabase = createSupabaseRequestClient(accessToken)

  const { data, error } = await supabase.rpc(REMOVE_COLLECTION_QUESTION_WITH_ORPHAN_STRATEGY_RPC_NAME, {
    p_collection_id: collectionId,
    p_question_id: questionId,
    p_orphan_strategy: normalizedStrategy,
    p_target_collection_id: targetCollectionId ?? null,
  })

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to remove question from collection.',
      notFoundMessage: 'Collection question link not found.',
      invalidMessage: 'Invalid orphan resolution strategy.',
      foreignKeyMessage: 'Target collection not found.',
    })
  }

  const payload = normalizeRpcPayload(data, {
    fallbackMessage: 'Unexpected response while removing question from collection.',
  })

  const status = typeof payload.status === 'string' ? payload.status : ''
  const orphanQuestionIds = normalizeUuidList(payload.orphan_question_ids ?? [])

  if (status === 'orphan_conflict') {
    throw new QuizQuestionRepositoryError(
      'Removing this question would orphan it from all collections.',
      {
        statusCode: 409,
        details: {
          orphanQuestionIds,
          collectionId,
          questionId,
        },
      },
    )
  }

  if (status !== 'removed') {
    throw new QuizQuestionRepositoryError('Unexpected response while removing question from collection.', {
      statusCode: 502,
      details: payload,
    })
  }

  return {
    collectionId,
    questionId,
    orphanQuestionIds,
    deletedQuestionIds: normalizeUuidList(payload.deleted_question_ids ?? []),
    reassignedQuestionIds: normalizeUuidList(payload.reassigned_question_ids ?? []),
  }
}

export const updateQuestion = async ({
  accessToken,
  questionId,
  question,
  mcqQuestion,
  completeAnswer,
  mcqOptions,
  subject,
  difficulty,
}) => {
  const updates = {}

  if (question !== undefined) {
    updates.question = normalizeRequiredText(question, { field: 'question' })
  }

  if (mcqQuestion !== undefined) {
    updates.mcq_question = normalizeRequiredText(mcqQuestion, { field: 'mcqQuestion' })
  }

  if (completeAnswer !== undefined) {
    updates.complete_answer = normalizeRequiredText(completeAnswer, { field: 'completeAnswer' })
  }

  if (mcqOptions !== undefined) {
    if (!Array.isArray(mcqOptions)) {
      throw new QuizQuestionRepositoryError('"mcqOptions" must be an array.', {
        statusCode: 400,
      })
    }

    updates.mcq_options = mcqOptions
  }

  if (subject !== undefined) {
    updates.subject = normalizeRequiredText(subject, { field: 'subject' })
  }

  if (difficulty !== undefined) {
    if (!Number.isInteger(difficulty)) {
      throw new QuizQuestionRepositoryError('"difficulty" must be an integer.', {
        statusCode: 400,
      })
    }

    updates.difficulty = difficulty
  }

  if (Object.keys(updates).length === 0) {
    throw new QuizQuestionRepositoryError('No question fields to update.', {
      statusCode: 400,
    })
  }

  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', questionId)
    .select('id, question, mcq_question, complete_answer, mcq_options, subject, difficulty, created_at, updated_at')
    .single()

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to update quiz question.',
      notFoundMessage: 'Question not found.',
      invalidMessage: 'Invalid question update payload.',
    })
  }

  return mapQuestionRow(data)
}

export const deleteQuestion = async ({ accessToken, questionId }) => {
  const supabase = createSupabaseRequestClient(accessToken)
  const { data, error } = await supabase.from('questions').delete().eq('id', questionId).select('id')

  if (error) {
    throwFromSupabaseError(error, {
      fallbackMessage: 'Failed to delete quiz question.',
    })
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new QuizQuestionRepositoryError('Question not found.', {
      statusCode: 404,
      details: { questionId },
    })
  }

  return { id: data[0].id }
}

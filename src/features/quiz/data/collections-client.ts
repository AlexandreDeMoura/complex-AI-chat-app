import type {
  OrphanStrategy,
  QuizCollectionDeleteResult,
  QuizCollectionQuestion,
  QuizCollectionQuestionLinkResult,
  QuizCollectionQuestionRemovalResult,
  QuizCollectionSummary,
  QuizOption,
  QuizQuestionDeleteResult,
} from '@/features/quiz/model'
import {
  QuizApiError,
  createAuthorizedJsonHeaders,
  parseQuizApiError,
} from '@/features/quiz/data/quiz-request'

interface ListCollectionsApiResponse {
  collections?: unknown
}

interface CollectionApiResponse {
  collection?: unknown
}

interface ListCollectionQuestionsApiResponse {
  questions?: unknown
}

interface SearchQuestionsApiResponse {
  questions?: unknown
}

interface CreateQuizCollectionParams {
  accessToken: string
  name: string
  description?: string | null
}

interface UpdateQuizCollectionParams {
  accessToken: string
  collectionId: string
  name?: string
  description?: string | null
}

interface DeleteQuizCollectionParams {
  accessToken: string
  collectionId: string
  orphanStrategy?: OrphanStrategy
  targetCollectionId?: string
}

interface RemoveQuestionFromCollectionParams {
  accessToken: string
  collectionId: string
  questionId: string
  orphanStrategy?: OrphanStrategy
  targetCollectionId?: string
}

interface SearchQuizQuestionsParams {
  accessToken: string
  search?: string
  excludeCollectionId?: string
}

interface AddQuestionsToCollectionParams {
  accessToken: string
  collectionId: string
  questionIds: string[]
}

interface UpdateQuizQuestionParams {
  accessToken: string
  questionId: string
  question: string
  mcqQuestion: string
  completeAnswer: string
  mcqOptions: QuizOption[]
  subject: string
  difficulty: number
}

interface DeleteQuizQuestionParams {
  accessToken: string
  questionId: string
}

interface ListQuizCollectionQuestionsParams {
  accessToken: string
  collectionId: string
  mastery?: number[]
  difficulty?: number[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return value === null ? null : null
}

interface NormalizeCollectionOptions {
  requireQuestionCount: boolean
  fallbackQuestionCount?: number
}

function normalizeCollectionPayload(
  value: unknown,
  { requireQuestionCount, fallbackQuestionCount = 0 }: NormalizeCollectionOptions,
): QuizCollectionSummary {
  if (!isRecord(value)) {
    throw new QuizApiError('Collection response payload is invalid.', 502)
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const description = normalizeOptionalString(value.description)
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt.trim() : ''
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt.trim() : ''

  const rawQuestionCount = value.questionCount
  const hasNumericQuestionCount =
    typeof rawQuestionCount === 'number' && Number.isInteger(rawQuestionCount) && rawQuestionCount >= 0

  const questionCount = hasNumericQuestionCount
    ? rawQuestionCount
    : requireQuestionCount
      ? NaN
      : fallbackQuestionCount

  if (!id || !name || !createdAt || !updatedAt || Number.isNaN(questionCount)) {
    throw new QuizApiError('Collection response payload is missing expected fields.', 502)
  }

  return {
    id,
    name,
    description,
    questionCount,
    createdAt,
    updatedAt,
  }
}

function normalizeQuizOptionPayload(value: unknown): QuizOption {
  if (!isRecord(value)) {
    throw new QuizApiError('Question options payload is invalid.', 502)
  }

  const option = typeof value.option === 'string' ? value.option.trim() : ''
  const isCorrect = value.is_correct

  if (!option || typeof isCorrect !== 'boolean') {
    throw new QuizApiError('Question options payload is missing expected fields.', 502)
  }

  return {
    option,
    is_correct: isCorrect,
  }
}

function normalizeQuestionPayload(value: unknown): QuizCollectionQuestion {
  if (!isRecord(value)) {
    throw new QuizApiError('Question response payload is invalid.', 502)
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const question = typeof value.question === 'string' ? value.question.trim() : ''
  const mcqQuestion = typeof value.mcqQuestion === 'string' ? value.mcqQuestion.trim() : ''
  const completeAnswer = typeof value.completeAnswer === 'string' ? value.completeAnswer.trim() : ''
  const subject = typeof value.subject === 'string' ? value.subject.trim() : ''
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt.trim() : ''
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt.trim() : ''

  const difficulty =
    typeof value.difficulty === 'number' && Number.isInteger(value.difficulty)
      ? value.difficulty
      : NaN

  const masteryLevel =
    typeof value.masteryLevel === 'number' && Number.isInteger(value.masteryLevel)
      ? value.masteryLevel
      : NaN

  const mcqOptions = Array.isArray(value.mcqOptions)
    ? value.mcqOptions.map((option) => normalizeQuizOptionPayload(option))
    : null

  if (
    !id
    || !question
    || !mcqQuestion
    || !completeAnswer
    || !subject
    || !createdAt
    || !updatedAt
    || Number.isNaN(difficulty)
    || Number.isNaN(masteryLevel)
    || mcqOptions === null
    || mcqOptions.length !== 4
  ) {
    throw new QuizApiError('Question response payload is missing expected fields.', 502)
  }

  return {
    id,
    question,
    mcqQuestion,
    completeAnswer,
    mcqOptions,
    subject,
    difficulty,
    masteryLevel,
    createdAt,
    updatedAt,
  }
}

function normalizeMutationQuestionIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new QuizApiError(`Mutation response field "${field}" is invalid.`, 502)
  }

  const ids = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)

  return Array.from(new Set(ids))
}

function normalizeCollectionDeletePayload(value: unknown): QuizCollectionDeleteResult {
  if (!isRecord(value)) {
    throw new QuizApiError('Delete collection response payload is invalid.', 502)
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!id) {
    throw new QuizApiError('Delete collection response payload is missing expected fields.', 502)
  }

  return {
    id,
    orphanQuestionIds: normalizeMutationQuestionIds(value.orphanQuestionIds ?? [], 'orphanQuestionIds'),
    deletedQuestionIds: normalizeMutationQuestionIds(value.deletedQuestionIds ?? [], 'deletedQuestionIds'),
    reassignedQuestionIds: normalizeMutationQuestionIds(value.reassignedQuestionIds ?? [], 'reassignedQuestionIds'),
  }
}

function normalizeQuestionRemovalPayload(value: unknown): QuizCollectionQuestionRemovalResult {
  if (!isRecord(value)) {
    throw new QuizApiError('Remove question response payload is invalid.', 502)
  }

  const collectionId = typeof value.collectionId === 'string' ? value.collectionId.trim() : ''
  const questionId = typeof value.questionId === 'string' ? value.questionId.trim() : ''

  if (!collectionId || !questionId) {
    throw new QuizApiError('Remove question response payload is missing expected fields.', 502)
  }

  return {
    collectionId,
    questionId,
    orphanQuestionIds: normalizeMutationQuestionIds(value.orphanQuestionIds ?? [], 'orphanQuestionIds'),
    deletedQuestionIds: normalizeMutationQuestionIds(value.deletedQuestionIds ?? [], 'deletedQuestionIds'),
    reassignedQuestionIds: normalizeMutationQuestionIds(value.reassignedQuestionIds ?? [], 'reassignedQuestionIds'),
  }
}

function normalizeQuestionLinkPayload(value: unknown): QuizCollectionQuestionLinkResult {
  if (!isRecord(value)) {
    throw new QuizApiError('Add question response payload is invalid.', 502)
  }

  const collectionId = typeof value.collectionId === 'string' ? value.collectionId.trim() : ''
  if (!collectionId) {
    throw new QuizApiError('Add question response payload is missing expected fields.', 502)
  }

  return {
    collectionId,
    questionIds: normalizeMutationQuestionIds(value.questionIds ?? [], 'questionIds'),
  }
}

function normalizeQuestionDeletePayload(value: unknown): QuizQuestionDeleteResult {
  if (!isRecord(value)) {
    throw new QuizApiError('Delete question response payload is invalid.', 502)
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!id) {
    throw new QuizApiError('Delete question response payload is missing expected fields.', 502)
  }

  return { id }
}

function buildOrphanStrategyQuery({
  orphanStrategy,
  targetCollectionId,
}: {
  orphanStrategy?: OrphanStrategy
  targetCollectionId?: string
}): string {
  const params = new URLSearchParams()

  if (orphanStrategy) {
    params.set('orphan_strategy', orphanStrategy)
  }

  if (orphanStrategy === 'reassign') {
    const targetId = typeof targetCollectionId === 'string' ? targetCollectionId.trim() : ''
    if (!targetId) {
      throw new QuizApiError('Target collection is required when using reassign strategy.', 400)
    }
    params.set('target', targetId)
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

function normalizeIntegerQueryFilter(
  value: number[] | undefined,
  {
    fieldLabel,
    min,
    max,
  }: {
    fieldLabel: string
    min?: number
    max?: number
  },
): number[] | null {
  if (value === undefined || value === null) {
    return null
  }

  if (!Array.isArray(value)) {
    throw new QuizApiError(`${fieldLabel} filter must be an array of integers.`, 400)
  }

  const normalized: number[] = []
  const seen = new Set<number>()

  for (const entry of value) {
    if (!Number.isInteger(entry)) {
      throw new QuizApiError(`${fieldLabel} filter must contain only integers.`, 400)
    }

    const isOutOfRange = (min !== undefined && entry < min) || (max !== undefined && entry > max)
    if (isOutOfRange) {
      if (min !== undefined && max !== undefined) {
        throw new QuizApiError(`${fieldLabel} filter values must be between ${min} and ${max}.`, 400)
      }

      throw new QuizApiError(`${fieldLabel} filter contains an out-of-range value.`, 400)
    }

    if (seen.has(entry)) {
      continue
    }

    seen.add(entry)
    normalized.push(entry)
  }

  return normalized.length > 0 ? normalized : null
}

export function extractOrphanQuestionIdsFromDetails(details: unknown): string[] {
  if (!isRecord(details)) {
    return []
  }

  const raw = details.orphanQuestionIds ?? details.orphan_question_ids
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

export async function listQuizCollections(accessToken: string): Promise<QuizCollectionSummary[]> {
  const response = await fetch('/api/quiz/collections', {
    method: 'GET',
    headers: createAuthorizedJsonHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to load quiz collections.')
  }

  let payload: ListCollectionsApiResponse
  try {
    payload = (await response.json()) as ListCollectionsApiResponse
  } catch {
    throw new QuizApiError('Collections response is not valid JSON.', 502)
  }

  if (!Array.isArray(payload.collections)) {
    throw new QuizApiError('Collections response is missing the collection list.', 502)
  }

  return payload.collections.map((collection) =>
    normalizeCollectionPayload(collection, { requireQuestionCount: true }))
}

export async function createQuizCollection({
  accessToken,
  name,
  description,
}: CreateQuizCollectionParams): Promise<QuizCollectionSummary> {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new QuizApiError('Collection name is required.', 400)
  }

  const normalizedDescription = typeof description === 'string'
    ? description.trim() || null
    : description ?? null

  const response = await fetch('/api/quiz/collections', {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      name: trimmedName,
      description: normalizedDescription,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to create quiz collection.')
  }

  let payload: CollectionApiResponse
  try {
    payload = (await response.json()) as CollectionApiResponse
  } catch {
    throw new QuizApiError('Create collection response is not valid JSON.', 502)
  }

  return normalizeCollectionPayload(payload.collection, { requireQuestionCount: true })
}

export async function listQuizCollectionQuestions({
  accessToken,
  collectionId,
  mastery,
  difficulty,
}: ListQuizCollectionQuestionsParams): Promise<QuizCollectionQuestion[]> {
  const normalizedCollectionId = collectionId.trim()
  if (!normalizedCollectionId) {
    throw new QuizApiError('Collection id is required.', 400)
  }

  const normalizedMastery = normalizeIntegerQueryFilter(mastery, {
    fieldLabel: 'Mastery',
    min: 0,
    max: 5,
  })
  const normalizedDifficulty = normalizeIntegerQueryFilter(difficulty, {
    fieldLabel: 'Difficulty',
    min: -32768,
    max: 32767,
  })

  const params = new URLSearchParams()
  if (normalizedMastery) {
    params.set('mastery', normalizedMastery.join(','))
  }

  if (normalizedDifficulty) {
    params.set('difficulty', normalizedDifficulty.join(','))
  }

  const query = params.toString()
  const response = await fetch(
    `/api/quiz/collections/${encodeURIComponent(normalizedCollectionId)}/questions${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      headers: createAuthorizedJsonHeaders(accessToken),
    },
  )

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to load collection questions.')
  }

  let payload: ListCollectionQuestionsApiResponse
  try {
    payload = (await response.json()) as ListCollectionQuestionsApiResponse
  } catch {
    throw new QuizApiError('Collection questions response is not valid JSON.', 502)
  }

  if (!Array.isArray(payload.questions)) {
    throw new QuizApiError('Collection questions response is missing the question list.', 502)
  }

  return payload.questions.map((question) => normalizeQuestionPayload(question))
}

export async function updateQuizCollection({
  accessToken,
  collectionId,
  name,
  description,
}: UpdateQuizCollectionParams): Promise<QuizCollectionSummary> {
  const normalizedCollectionId = collectionId.trim()
  if (!normalizedCollectionId) {
    throw new QuizApiError('Collection id is required.', 400)
  }

  const payload: Record<string, string | null> = {}

  if (typeof name === 'string') {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new QuizApiError('Collection name is required.', 400)
    }

    payload.name = trimmedName
  }

  if (description !== undefined) {
    payload.description = typeof description === 'string' ? description.trim() || null : null
  }

  if (Object.keys(payload).length === 0) {
    throw new QuizApiError('At least one collection field is required for update.', 400)
  }

  const response = await fetch(`/api/quiz/collections/${encodeURIComponent(normalizedCollectionId)}`, {
    method: 'PATCH',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to update quiz collection.')
  }

  let body: CollectionApiResponse
  try {
    body = (await response.json()) as CollectionApiResponse
  } catch {
    throw new QuizApiError('Update collection response is not valid JSON.', 502)
  }

  return normalizeCollectionPayload(body.collection, {
    requireQuestionCount: false,
    fallbackQuestionCount: 0,
  })
}

export async function deleteQuizCollection({
  accessToken,
  collectionId,
  orphanStrategy,
  targetCollectionId,
}: DeleteQuizCollectionParams): Promise<QuizCollectionDeleteResult> {
  const normalizedCollectionId = collectionId.trim()
  if (!normalizedCollectionId) {
    throw new QuizApiError('Collection id is required.', 400)
  }

  const query = buildOrphanStrategyQuery({ orphanStrategy, targetCollectionId })
  const response = await fetch(`/api/quiz/collections/${encodeURIComponent(normalizedCollectionId)}${query}`, {
    method: 'DELETE',
    headers: createAuthorizedJsonHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to delete quiz collection.')
  }

  let payload: unknown
  try {
    payload = (await response.json()) as unknown
  } catch {
    throw new QuizApiError('Delete collection response is not valid JSON.', 502)
  }

  return normalizeCollectionDeletePayload(payload)
}

export async function removeQuizQuestionFromCollection({
  accessToken,
  collectionId,
  questionId,
  orphanStrategy,
  targetCollectionId,
}: RemoveQuestionFromCollectionParams): Promise<QuizCollectionQuestionRemovalResult> {
  const normalizedCollectionId = collectionId.trim()
  const normalizedQuestionId = questionId.trim()

  if (!normalizedCollectionId) {
    throw new QuizApiError('Collection id is required.', 400)
  }

  if (!normalizedQuestionId) {
    throw new QuizApiError('Question id is required.', 400)
  }

  const query = buildOrphanStrategyQuery({ orphanStrategy, targetCollectionId })
  const response = await fetch(
    `/api/quiz/collections/${encodeURIComponent(normalizedCollectionId)}/questions/${encodeURIComponent(normalizedQuestionId)}${query}`,
    {
      method: 'DELETE',
      headers: createAuthorizedJsonHeaders(accessToken),
    },
  )

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to remove question from collection.')
  }

  let payload: unknown
  try {
    payload = (await response.json()) as unknown
  } catch {
    throw new QuizApiError('Remove question response is not valid JSON.', 502)
  }

  return normalizeQuestionRemovalPayload(payload)
}

export async function searchQuizQuestions({
  accessToken,
  search,
  excludeCollectionId,
}: SearchQuizQuestionsParams): Promise<QuizCollectionQuestion[]> {
  const params = new URLSearchParams()
  const normalizedSearch = typeof search === 'string' ? search.trim() : ''
  const normalizedExcludeCollectionId = typeof excludeCollectionId === 'string'
    ? excludeCollectionId.trim()
    : ''

  if (normalizedSearch) {
    params.set('search', normalizedSearch)
  }

  if (normalizedExcludeCollectionId) {
    params.set('exclude_collection', normalizedExcludeCollectionId)
  }

  const query = params.toString()
  const response = await fetch(`/api/quiz/questions${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: createAuthorizedJsonHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to search quiz questions.')
  }

  let payload: SearchQuestionsApiResponse
  try {
    payload = (await response.json()) as SearchQuestionsApiResponse
  } catch {
    throw new QuizApiError('Question search response is not valid JSON.', 502)
  }

  if (!Array.isArray(payload.questions)) {
    throw new QuizApiError('Question search response is missing the question list.', 502)
  }

  return payload.questions.map((question) => normalizeQuestionPayload(question))
}

export async function addQuizQuestionsToCollection({
  accessToken,
  collectionId,
  questionIds,
}: AddQuestionsToCollectionParams): Promise<QuizCollectionQuestionLinkResult> {
  const normalizedCollectionId = collectionId.trim()
  if (!normalizedCollectionId) {
    throw new QuizApiError('Collection id is required.', 400)
  }

  const normalizedQuestionIds = Array.from(
    new Set(questionIds.map((questionId) => questionId.trim()).filter((questionId) => Boolean(questionId))),
  )

  if (normalizedQuestionIds.length === 0) {
    throw new QuizApiError('At least one question id is required.', 400)
  }

  const response = await fetch(`/api/quiz/collections/${encodeURIComponent(normalizedCollectionId)}/questions`, {
    method: 'POST',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      question_ids: normalizedQuestionIds,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to add questions to collection.')
  }

  let payload: unknown
  try {
    payload = (await response.json()) as unknown
  } catch {
    throw new QuizApiError('Add questions response is not valid JSON.', 502)
  }

  return normalizeQuestionLinkPayload(payload)
}

export async function updateQuizQuestion({
  accessToken,
  questionId,
  question,
  mcqQuestion,
  completeAnswer,
  mcqOptions,
  subject,
  difficulty,
}: UpdateQuizQuestionParams): Promise<QuizCollectionQuestion> {
  const normalizedQuestionId = questionId.trim()
  if (!normalizedQuestionId) {
    throw new QuizApiError('Question id is required.', 400)
  }

  if (!Number.isInteger(difficulty)) {
    throw new QuizApiError('Question difficulty must be an integer.', 400)
  }

  const response = await fetch(`/api/quiz/questions/${encodeURIComponent(normalizedQuestionId)}`, {
    method: 'PATCH',
    headers: createAuthorizedJsonHeaders(accessToken),
    body: JSON.stringify({
      question: question.trim(),
      mcq_question: mcqQuestion.trim(),
      complete_answer: completeAnswer.trim(),
      mcq_options: mcqOptions.map((option) => ({
        option: option.option.trim(),
        is_correct: option.is_correct,
      })),
      subject: subject.trim(),
      difficulty,
    }),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to update quiz question.')
  }

  let payload: { question?: unknown }
  try {
    payload = (await response.json()) as { question?: unknown }
  } catch {
    throw new QuizApiError('Update question response is not valid JSON.', 502)
  }

  return normalizeQuestionPayload(payload.question)
}

export async function deleteQuizQuestion({
  accessToken,
  questionId,
}: DeleteQuizQuestionParams): Promise<QuizQuestionDeleteResult> {
  const normalizedQuestionId = questionId.trim()
  if (!normalizedQuestionId) {
    throw new QuizApiError('Question id is required.', 400)
  }

  const response = await fetch(`/api/quiz/questions/${encodeURIComponent(normalizedQuestionId)}`, {
    method: 'DELETE',
    headers: createAuthorizedJsonHeaders(accessToken),
  })

  if (!response.ok) {
    throw await parseQuizApiError(response, 'Failed to delete quiz question.')
  }

  let payload: unknown
  try {
    payload = (await response.json()) as unknown
  } catch {
    throw new QuizApiError('Delete question response is not valid JSON.', 502)
  }

  return normalizeQuestionDeletePayload(payload)
}

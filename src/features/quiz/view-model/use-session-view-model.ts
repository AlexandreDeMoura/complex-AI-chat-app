import { useCallback, useMemo, useRef, useState } from 'react'
import {
  listQuizCollectionQuestions,
  QuizApiError,
} from '@/features/quiz/data'
import type {
  QuizCollectionQuestion,
  QuizMasteryLevel,
  QuizSessionFilterInput,
  QuizSessionFilters,
} from '@/features/quiz/model'

const QUIZ_AUTH_ERROR_MESSAGE =
  'Your session is no longer valid. Sign in again to continue with quiz actions.'
const QUIZ_SESSION_FILTER_MIN_DIFFICULTY = -32768
const QUIZ_SESSION_FILTER_MAX_DIFFICULTY = 32767
const QUIZ_SESSION_ALL_MASTERY_LEVELS: QuizMasteryLevel[] = [0, 1, 2, 3, 4, 5]

interface UseSessionViewModelOptions {
  accessToken: string | null
}

interface BuildPoolInput {
  questions: QuizCollectionQuestion[]
  excludedQuestionIds: Set<string>
}

interface RandomSelection {
  questionId: string
  remainingPool: string[]
}

export interface SessionViewModel {
  collectionId: string | null
  draftFilters: QuizSessionFilters
  appliedFilters: QuizSessionFilters
  answeredInSession: string[]
  pool: string[]
  currentQuestion: QuizCollectionQuestion | null
  sessionActive: boolean
  availableDifficulties: number[]
  matchingQuestionCount: number
  remainingQuestionCount: number
  answeredQuestionCount: number
  isPoolLoading: boolean
  poolError: string | null
  startSession: (collectionId: string, filters: QuizSessionFilterInput) => Promise<boolean>
  nextQuestion: () => void
  updateFilters: (filters: QuizSessionFilterInput) => Promise<boolean>
  endSession: () => void
}

function createInitialSessionFilters(): QuizSessionFilters {
  return {
    mastery: [...QUIZ_SESSION_ALL_MASTERY_LEVELS],
    difficulty: [],
  }
}

function formatQuizApiErrorDetails(details: unknown): string[] {
  if (Array.isArray(details)) {
    return details
      .map((detail) => {
        if (!detail || typeof detail !== 'object') {
          return null
        }

        const detailMessage = (detail as Record<string, unknown>).message
        return typeof detailMessage === 'string' && detailMessage.trim()
          ? detailMessage.trim()
          : null
      })
      .filter((message): message is string => Boolean(message))
  }

  if (!details || typeof details !== 'object') {
    return []
  }

  return Object.entries(details as Record<string, unknown>)
    .map(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return null
      }

      const serialized = typeof value === 'string' ? value.trim() : JSON.stringify(value)
      return serialized ? `${key}: ${serialized}` : null
    })
    .filter((message): message is string => Boolean(message))
}

function formatQuizApiError(error: QuizApiError): string {
  const detailMessages = formatQuizApiErrorDetails(error.details)
  if (detailMessages.length === 0) {
    return error.message
  }

  return [error.message, ...detailMessages].join(' ')
}

function normalizeMasteryFilter(
  mastery: QuizSessionFilterInput['mastery'],
  fallback: QuizSessionFilters['mastery'],
): QuizSessionFilters['mastery'] {
  if (mastery === undefined || mastery === null) {
    return [...fallback]
  }

  if (!Array.isArray(mastery)) {
    throw new QuizApiError('Mastery filter must be an array of integers.', 400)
  }

  const normalized = new Set<QuizMasteryLevel>()
  for (const entry of mastery) {
    if (!Number.isInteger(entry) || entry < 0 || entry > 5) {
      throw new QuizApiError('Mastery filter values must be integers between 0 and 5.', 400)
    }

    normalized.add(entry as QuizMasteryLevel)
  }

  return Array.from(normalized).sort((left, right) => left - right)
}

function normalizeDifficultyFilter(
  difficulty: QuizSessionFilterInput['difficulty'],
  fallback: QuizSessionFilters['difficulty'],
): QuizSessionFilters['difficulty'] {
  if (difficulty === undefined || difficulty === null) {
    return [...fallback]
  }

  if (!Array.isArray(difficulty)) {
    throw new QuizApiError('Difficulty filter must be an array of integers.', 400)
  }

  const normalized = new Set<number>()
  for (const entry of difficulty) {
    const isValidDifficulty =
      Number.isInteger(entry)
      && entry >= QUIZ_SESSION_FILTER_MIN_DIFFICULTY
      && entry <= QUIZ_SESSION_FILTER_MAX_DIFFICULTY

    if (!isValidDifficulty) {
      throw new QuizApiError('Difficulty filter values must be valid integers.', 400)
    }

    normalized.add(entry)
  }

  return Array.from(normalized).sort((left, right) => left - right)
}

function normalizeSessionFilters(
  filters: QuizSessionFilterInput,
  fallback: QuizSessionFilters,
): QuizSessionFilters {
  return {
    mastery: normalizeMasteryFilter(filters.mastery, fallback.mastery),
    difficulty: normalizeDifficultyFilter(filters.difficulty, fallback.difficulty),
  }
}

function getSortedDifficultyValues(questions: QuizCollectionQuestion[]): number[] {
  const difficulties = new Set<number>()

  for (const question of questions) {
    difficulties.add(question.difficulty)
  }

  return Array.from(difficulties).sort((left, right) => left - right)
}

function buildQuestionMap(questions: QuizCollectionQuestion[]): Record<string, QuizCollectionQuestion> {
  const entries = questions.map((question) => [question.id, question] as const)
  return Object.fromEntries(entries)
}

function buildSessionPool({
  questions,
  excludedQuestionIds,
}: BuildPoolInput): string[] {
  const pool: string[] = []
  const seen = new Set<string>()

  for (const question of questions) {
    if (!question.id || seen.has(question.id) || excludedQuestionIds.has(question.id)) {
      continue
    }

    seen.add(question.id)
    pool.push(question.id)
  }

  return pool
}

function pickRandomQuestionId(pool: string[]): RandomSelection | null {
  if (pool.length === 0) {
    return null
  }

  const randomIndex = Math.floor(Math.random() * pool.length)
  const questionId = pool[randomIndex]
  if (!questionId) {
    return null
  }

  const remainingPool = pool.filter((_, index) => index !== randomIndex)
  return {
    questionId,
    remainingPool,
  }
}

function areEqualNumberArrays(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function shouldUseAllCollectionQuestions(
  filters: QuizSessionFilters,
  allDifficulties: number[],
): boolean {
  return (
    areEqualNumberArrays(filters.mastery, QUIZ_SESSION_ALL_MASTERY_LEVELS)
    && areEqualNumberArrays(filters.difficulty, allDifficulties)
  )
}

function hasEmptyFilterSelection(filters: QuizSessionFilters): boolean {
  return filters.mastery.length === 0 || filters.difficulty.length === 0
}

export function useSessionViewModel({
  accessToken,
}: UseSessionViewModelOptions): SessionViewModel {
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<QuizSessionFilters>(createInitialSessionFilters)
  const [appliedFilters, setAppliedFilters] = useState<QuizSessionFilters>(createInitialSessionFilters)
  const [answeredInSession, setAnsweredInSession] = useState<string[]>([])
  const [pool, setPool] = useState<string[]>([])
  const [questionById, setQuestionById] = useState<Record<string, QuizCollectionQuestion>>({})
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [availableDifficulties, setAvailableDifficulties] = useState<number[]>([])
  const [matchingQuestionCount, setMatchingQuestionCount] = useState(0)
  const [isPoolLoading, setIsPoolLoading] = useState(false)
  const [poolError, setPoolError] = useState<string | null>(null)
  const latestPoolRequestId = useRef(0)

  const currentQuestion = useMemo(() => {
    if (!currentQuestionId) {
      return null
    }

    return questionById[currentQuestionId] ?? null
  }, [currentQuestionId, questionById])

  const endSession = useCallback(() => {
    latestPoolRequestId.current += 1
    setCollectionId(null)
    setDraftFilters(createInitialSessionFilters())
    setAppliedFilters(createInitialSessionFilters())
    setAnsweredInSession([])
    setPool([])
    setQuestionById({})
    setCurrentQuestionId(null)
    setSessionActive(false)
    setAvailableDifficulties([])
    setMatchingQuestionCount(0)
    setIsPoolLoading(false)
    setPoolError(null)
  }, [])

  const startSession = useCallback(async (
    nextCollectionId: string,
    filters: QuizSessionFilterInput,
  ): Promise<boolean> => {
    const normalizedCollectionId = nextCollectionId.trim()
    if (!normalizedCollectionId) {
      setPoolError('Collection id is required to start a session.')
      return false
    }

    if (!accessToken) {
      setPoolError(QUIZ_AUTH_ERROR_MESSAGE)
      return false
    }

    const requestId = latestPoolRequestId.current + 1
    latestPoolRequestId.current = requestId
    setIsPoolLoading(true)
    setPoolError(null)

    try {
      const allCollectionQuestions = await listQuizCollectionQuestions({
        accessToken,
        collectionId: normalizedCollectionId,
      })

      if (latestPoolRequestId.current !== requestId) {
        return false
      }

      const nextAvailableDifficulties = getSortedDifficultyValues(allCollectionQuestions)
      const fallbackFilters: QuizSessionFilters = {
        mastery: [...QUIZ_SESSION_ALL_MASTERY_LEVELS],
        difficulty: nextAvailableDifficulties,
      }
      const normalizedFilters = normalizeSessionFilters(filters, fallbackFilters)

      const filteredQuestions = hasEmptyFilterSelection(normalizedFilters)
        ? []
        : shouldUseAllCollectionQuestions(normalizedFilters, nextAvailableDifficulties)
          ? allCollectionQuestions
          : await listQuizCollectionQuestions({
              accessToken,
              collectionId: normalizedCollectionId,
              mastery: normalizedFilters.mastery,
              difficulty: normalizedFilters.difficulty,
            })

      if (latestPoolRequestId.current !== requestId) {
        return false
      }

      const nextPool = buildSessionPool({
        questions: filteredQuestions,
        excludedQuestionIds: new Set<string>(),
      })
      const firstSelection = pickRandomQuestionId(nextPool)

      setCollectionId(normalizedCollectionId)
      setDraftFilters(normalizedFilters)
      setAppliedFilters(normalizedFilters)
      setAvailableDifficulties(nextAvailableDifficulties)
      setMatchingQuestionCount(filteredQuestions.length)
      setQuestionById(buildQuestionMap(filteredQuestions))

      if (!firstSelection) {
        setSessionActive(false)
        setCurrentQuestionId(null)
        setAnsweredInSession([])
        setPool([])
        return false
      }

      setSessionActive(true)
      setCurrentQuestionId(firstSelection.questionId)
      setAnsweredInSession([firstSelection.questionId])
      setPool(firstSelection.remainingPool)
      return true
    } catch (error) {
      if (latestPoolRequestId.current !== requestId) {
        return false
      }

      if (error instanceof QuizApiError) {
        const errorMessage = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : formatQuizApiError(error)
        setPoolError(errorMessage)
      } else {
        setPoolError('Unable to start this session right now.')
      }

      return false
    } finally {
      if (latestPoolRequestId.current === requestId) {
        setIsPoolLoading(false)
      }
    }
  }, [accessToken])

  const updateFilters = useCallback(async (
    filters: QuizSessionFilterInput,
  ): Promise<boolean> => {
    const normalizedCollectionId = collectionId?.trim() ?? ''
    if (!normalizedCollectionId) {
      setPoolError('Start a session before updating filters.')
      return false
    }

    if (!accessToken) {
      setPoolError(QUIZ_AUTH_ERROR_MESSAGE)
      return false
    }

    let normalizedFilters: QuizSessionFilters
    try {
      const fallbackFilters: QuizSessionFilters = {
        mastery: draftFilters.mastery,
        difficulty: availableDifficulties.length > 0 ? availableDifficulties : draftFilters.difficulty,
      }
      normalizedFilters = normalizeSessionFilters(filters, fallbackFilters)
    } catch (error) {
      if (error instanceof QuizApiError) {
        setPoolError(formatQuizApiError(error))
      } else {
        setPoolError('Unable to apply filters right now.')
      }
      return false
    }

    const requestId = latestPoolRequestId.current + 1
    latestPoolRequestId.current = requestId
    setDraftFilters(normalizedFilters)
    setIsPoolLoading(true)
    setPoolError(null)

    try {
      const filteredQuestions = hasEmptyFilterSelection(normalizedFilters)
        ? []
        : await listQuizCollectionQuestions({
            accessToken,
            collectionId: normalizedCollectionId,
            mastery: normalizedFilters.mastery,
            difficulty: normalizedFilters.difficulty,
          })

      if (latestPoolRequestId.current !== requestId) {
        return false
      }

      const excludedQuestionIds = new Set(answeredInSession)
      if (currentQuestionId) {
        excludedQuestionIds.add(currentQuestionId)
      }

      setAppliedFilters(normalizedFilters)
      setMatchingQuestionCount(filteredQuestions.length)
      setQuestionById((previousById) => ({
        ...previousById,
        ...buildQuestionMap(filteredQuestions),
      }))
      setPool(buildSessionPool({
        questions: filteredQuestions,
        excludedQuestionIds,
      }))

      return true
    } catch (error) {
      if (latestPoolRequestId.current !== requestId) {
        return false
      }

      if (error instanceof QuizApiError) {
        const errorMessage = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : formatQuizApiError(error)
        setPoolError(errorMessage)
      } else {
        setPoolError('Unable to apply filters right now.')
      }

      return false
    } finally {
      if (latestPoolRequestId.current === requestId) {
        setIsPoolLoading(false)
      }
    }
  }, [
    accessToken,
    answeredInSession,
    availableDifficulties,
    collectionId,
    currentQuestionId,
    draftFilters.difficulty,
    draftFilters.mastery,
  ])

  const nextQuestion = useCallback(() => {
    if (!sessionActive) {
      return
    }

    setPool((currentPool) => {
      const nextSelection = pickRandomQuestionId(currentPool)
      if (!nextSelection) {
        setCurrentQuestionId(null)
        return currentPool
      }

      setCurrentQuestionId(nextSelection.questionId)
      setAnsweredInSession((currentAnswered) => {
        if (currentAnswered.includes(nextSelection.questionId)) {
          return currentAnswered
        }

        return [...currentAnswered, nextSelection.questionId]
      })

      return nextSelection.remainingPool
    })
  }, [sessionActive])

  return useMemo<SessionViewModel>(() => ({
    collectionId,
    draftFilters,
    appliedFilters,
    answeredInSession,
    pool,
    currentQuestion,
    sessionActive,
    availableDifficulties,
    matchingQuestionCount,
    remainingQuestionCount: pool.length,
    answeredQuestionCount: answeredInSession.length,
    isPoolLoading,
    poolError,
    startSession,
    nextQuestion,
    updateFilters,
    endSession,
  }), [
    appliedFilters,
    answeredInSession,
    availableDifficulties,
    collectionId,
    currentQuestion,
    draftFilters,
    endSession,
    isPoolLoading,
    matchingQuestionCount,
    nextQuestion,
    pool,
    poolError,
    sessionActive,
    startSession,
    updateFilters,
  ])
}

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createQuizCollection,
  fetchFeedback,
  listQuizCollections,
  parseQuizUploadFile,
  persistQuizQuestionsBulk,
  QuizApiError,
} from '@/features/quiz/data'
import type {
  QuizCollectionSummary,
  QuizFeedbackState,
  QuizFeedbackStatus,
  QuizMode,
  QuizQuestion,
  QuizQuestionState,
  QuizScreen,
  QuizUploadReviewCollection,
  QuizUploadReviewMergeMode,
  QuizUploadError,
} from '@/features/quiz/model'
import { buildQuizPrelude } from '@/features/quiz/model'

const QUIZ_FEEDBACK_ERROR_MESSAGE =
  'Feedback is unavailable for this answer. You can continue the quiz.'
const QUIZ_AUTH_ERROR_MESSAGE =
  'Your session is no longer valid. Sign in again to continue with quiz actions.'

interface UseQuizStateOptions {
  accessToken: string | null
}

function formatQuizApiErrorDetails(details: unknown): string[] {
  if (!details || typeof details !== 'object') {
    return []
  }

  const entries: string[] = []
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (value === null || value === undefined || value === '') {
      continue
    }
    const formatted = typeof value === 'string' ? value : JSON.stringify(value)
    entries.push(`${key}: ${formatted}`)
  }

  return entries
}

function createInitialQuestionState(): QuizQuestionState {
  return {
    mode: 'open',
    open: {
      draftAnswer: '',
      submittedAnswer: null,
    },
    mcq: {
      selectedOptionIndex: null,
      submittedOptionIndex: null,
    },
    feedback: {
      status: 'idle',
    },
  }
}

function buildUploadReviewCollections(
  questions: QuizQuestion[],
  collectionNamesBySubject: Record<string, string>,
): QuizUploadReviewCollection[] {
  const questionCountBySubject = new Map<string, number>()

  for (const question of questions) {
    const subject = question.subject.trim()
    questionCountBySubject.set(subject, (questionCountBySubject.get(subject) ?? 0) + 1)
  }

  return Array.from(questionCountBySubject.entries())
    .map(([subject, questionCount]) => ({
      subject,
      questionCount,
      collectionName: collectionNamesBySubject[subject] ?? subject,
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject))
}

interface OpenFeedbackRequest {
  questionIndex: number
  quizSessionId: number
  question: string
  userAnswer: string
  completeAnswer: string
}

export interface QuizViewModel {
  screen: QuizScreen
  mode: QuizMode
  isUploading: boolean
  isLoadingReviewCollections: boolean
  uploadError: QuizUploadError | null
  reviewCollections: QuizUploadReviewCollection[]
  reviewMergeMode: QuizUploadReviewMergeMode
  reviewExistingCollections: QuizCollectionSummary[]
  reviewExistingCollectionId: string | null
  reviewNewCollectionName: string
  reviewNewCollectionDescription: string
  reviewCollectionsLoadError: string | null
  canConfirmUploadReview: boolean
  questionCount: number
  totalQuestionCount: number
  currentQuestionIndex: number
  availableSubjects: string[]
  selectedSubject: string | null
  currentQuestion: QuizQuestion | null
  openDraftAnswer: string
  submittedOpenAnswer: string | null
  feedbackStatus: QuizFeedbackStatus
  feedbackText: string | null
  feedbackError: string | null
  selectedMcqOptionIndex: number | null
  submittedMcqOptionIndex: number | null
  isOpenSubmitted: boolean
  isMcqSubmitted: boolean
  isFirstQuestion: boolean
  isLastQuestion: boolean
  isQuizChatOpen: boolean
  quizChatThreadId: string | null
  quizChatSystemContext: string | null
  setMode: (mode: QuizMode) => void
  setOpenDraftAnswer: (answer: string) => void
  submitOpenAnswer: () => void
  selectMcqOption: (optionIndex: number) => void
  submitMcqAnswer: () => void
  goToPreviousQuestion: () => void
  goToNextQuestion: () => void
  uploadQuizFile: (file: File | null) => Promise<void>
  setReviewCollectionName: (subject: string, collectionName: string) => void
  setReviewMergeMode: (mode: QuizUploadReviewMergeMode) => void
  setReviewExistingCollectionId: (collectionId: string | null) => void
  setReviewNewCollectionName: (name: string) => void
  setReviewNewCollectionDescription: (description: string) => void
  refreshReviewCollections: () => Promise<void>
  confirmUploadReview: () => Promise<void>
  cancelUploadReview: () => void
  setSubjectFilter: (subject: string | null) => void
  finishQuiz: () => void
  returnToUpload: () => void
  openQuizChatHandoff: () => void
  closeQuizChatHandoff: () => void
}

export function useQuizState({ accessToken }: UseQuizStateOptions): QuizViewModel {
  const [screen, setScreen] = useState<QuizScreen>('upload')
  const [reviewQuestions, setReviewQuestions] = useState<QuizQuestion[]>([])
  const [reviewCollectionNamesBySubject, setReviewCollectionNamesBySubject] = useState<Record<string, string>>({})
  const [reviewMergeMode, setReviewMergeMode] = useState<QuizUploadReviewMergeMode>('subject')
  const [reviewExistingCollections, setReviewExistingCollections] = useState<QuizCollectionSummary[]>([])
  const [reviewExistingCollectionId, setReviewExistingCollectionId] = useState<string | null>(null)
  const [reviewNewCollectionName, setReviewNewCollectionName] = useState('')
  const [reviewNewCollectionDescription, setReviewNewCollectionDescription] = useState('')
  const [isLoadingReviewCollections, setIsLoadingReviewCollections] = useState(false)
  const [reviewCollectionsLoadError, setReviewCollectionsLoadError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [questionStates, setQuestionStates] = useState<QuizQuestionState[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [uploadError, setUploadError] = useState<QuizUploadError | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isQuizChatOpen, setIsQuizChatOpen] = useState(false)
  const [quizChatThreadId, setQuizChatThreadId] = useState<string | null>(null)
  const [quizChatSystemContext, setQuizChatSystemContext] = useState<string | null>(null)
  const quizSessionIdRef = useRef(0)
  const openSubmissionKeysRef = useRef<Set<string>>(new Set())
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)

  const availableSubjects = useMemo(() => {
    const subjects = new Set(questions.map((q) => q.subject))
    return Array.from(subjects).sort()
  }, [questions])

  const filteredIndices = useMemo(() => {
    if (!selectedSubject) return questions.map((_, i) => i)
    return questions.reduce<number[]>((acc, q, i) => {
      if (q.subject === selectedSubject) acc.push(i)
      return acc
    }, [])
  }, [questions, selectedSubject])

  const actualQuestionIndex = filteredIndices[currentQuestionIndex] ?? 0

  const reviewCollections = useMemo(
    () => buildUploadReviewCollections(reviewQuestions, reviewCollectionNamesBySubject),
    [reviewCollectionNamesBySubject, reviewQuestions],
  )

  const resetQuizSession = useCallback(() => {
    quizSessionIdRef.current += 1
    openSubmissionKeysRef.current.clear()
    setSelectedSubject(null)
    setIsQuizChatOpen(false)
    setQuizChatThreadId(null)
    setQuizChatSystemContext(null)
    setScreen('upload')
    setReviewQuestions([])
    setReviewCollectionNamesBySubject({})
    setReviewMergeMode('subject')
    setReviewExistingCollections([])
    setReviewExistingCollectionId(null)
    setReviewNewCollectionName('')
    setReviewNewCollectionDescription('')
    setIsLoadingReviewCollections(false)
    setReviewCollectionsLoadError(null)
    setQuestions([])
    setQuestionStates([])
    setCurrentQuestionIndex(0)
  }, [])

  const updateQuestionStateAtIndex = useCallback(
    (
      questionIndex: number,
      update: (state: QuizQuestionState) => QuizQuestionState,
    ) => {
      setQuestionStates((previousQuestionStates) => {
        const currentState = previousQuestionStates[questionIndex]

        if (!currentState) {
          return previousQuestionStates
        }

        const nextState = update(currentState)
        if (nextState === currentState) {
          return previousQuestionStates
        }

        const nextQuestionStates = [...previousQuestionStates]
        nextQuestionStates[questionIndex] = nextState
        return nextQuestionStates
      })
    },
    [],
  )

  const updateCurrentQuestionState = useCallback(
    (update: (state: QuizQuestionState) => QuizQuestionState) => {
      updateQuestionStateAtIndex(actualQuestionIndex, update)
    },
    [actualQuestionIndex, updateQuestionStateAtIndex],
  )

  const startQuizSession = useCallback((nextQuestions: QuizQuestion[]) => {
    setQuestions(nextQuestions)
    setQuestionStates(nextQuestions.map(() => createInitialQuestionState()))
    setCurrentQuestionIndex(0)
    setSelectedSubject(null)
    setReviewQuestions([])
    setReviewCollectionNamesBySubject({})
    setReviewMergeMode('subject')
    setReviewExistingCollectionId(null)
    setReviewNewCollectionName('')
    setReviewNewCollectionDescription('')
    setIsLoadingReviewCollections(false)
    setReviewCollectionsLoadError(null)
    setScreen('question')
    setUploadError(null)
  }, [])

  const initializeUploadReview = useCallback((nextQuestions: QuizQuestion[]) => {
    const nextCollectionNamesBySubject: Record<string, string> = {}

    for (const question of nextQuestions) {
      const subject = question.subject.trim()

      if (subject in nextCollectionNamesBySubject) {
        continue
      }

      nextCollectionNamesBySubject[subject] = subject || 'Untitled collection'
    }

    setReviewQuestions(nextQuestions)
    setReviewCollectionNamesBySubject(nextCollectionNamesBySubject)
    setReviewMergeMode('subject')
    setReviewExistingCollections([])
    setReviewExistingCollectionId(null)
    setReviewNewCollectionName('')
    setReviewNewCollectionDescription('')
    setReviewCollectionsLoadError(null)
  }, [])

  const refreshReviewCollections = useCallback(async () => {
    if (!accessToken) {
      setReviewExistingCollections([])
      setReviewExistingCollectionId(null)
      setReviewCollectionsLoadError(QUIZ_AUTH_ERROR_MESSAGE)
      return
    }

    setIsLoadingReviewCollections(true)
    setReviewCollectionsLoadError(null)

    try {
      const collections = await listQuizCollections(accessToken)
      setReviewExistingCollections(collections)
      setReviewExistingCollectionId((currentCollectionId) => {
        if (currentCollectionId && collections.some((collection) => collection.id === currentCollectionId)) {
          return currentCollectionId
        }

        return collections[0]?.id ?? null
      })
    } catch (error) {
      if (error instanceof QuizApiError) {
        const message = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : error.message
        setReviewCollectionsLoadError(message)
      } else {
        setReviewCollectionsLoadError('Unable to load existing collections right now.')
      }
      setReviewExistingCollections([])
      setReviewExistingCollectionId(null)
    } finally {
      setIsLoadingReviewCollections(false)
    }
  }, [accessToken])

  const uploadQuizFile = useCallback(async (file: File | null) => {
    if (!file) {
      setUploadError({
        title: 'No file selected',
        details: ['Pick a .json file to start a quiz.'],
      })
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const uploadResult = await parseQuizUploadFile(file)

      if (!uploadResult.success) {
        setUploadError(uploadResult.error)
        resetQuizSession()
        return
      }

      if (!accessToken) {
        setUploadError({
          title: 'Session expired',
          details: [QUIZ_AUTH_ERROR_MESSAGE],
        })
        resetQuizSession()
        return
      }

      initializeUploadReview(uploadResult.questions)
      setScreen('review')
      setUploadError(null)
      await refreshReviewCollections()
    } catch (error) {
      if (error instanceof QuizApiError) {
        console.error('[quiz.upload] validation stage failed', {
          statusCode: error.statusCode,
          message: error.message,
          details: error.details,
        })

        const errorDetails =
          error.statusCode === 401
            ? [QUIZ_AUTH_ERROR_MESSAGE]
            : [error.message]

        setUploadError({
          title: error.statusCode === 401 ? 'Session expired' : 'Quiz upload failed',
          details: errorDetails,
        })
        resetQuizSession()
        return
      }

      setUploadError({
        title: 'File processing failed',
        details: ['An unexpected error occurred while reading the file. Try again.'],
      })
      resetQuizSession()
    } finally {
      setIsUploading(false)
    }
  }, [accessToken, initializeUploadReview, refreshReviewCollections, resetQuizSession])

  const setReviewCollectionName = useCallback((subject: string, collectionName: string) => {
    setUploadError(null)
    setReviewCollectionNamesBySubject((currentCollectionNamesBySubject) => {
      if (currentCollectionNamesBySubject[subject] === collectionName) {
        return currentCollectionNamesBySubject
      }

      return {
        ...currentCollectionNamesBySubject,
        [subject]: collectionName,
      }
    })
  }, [])

  const setReviewExistingCollectionIdValue = useCallback((collectionId: string | null) => {
    const normalizedCollectionId = typeof collectionId === 'string' ? collectionId.trim() : ''
    setUploadError(null)
    setReviewExistingCollectionId(normalizedCollectionId || null)
  }, [])

  const setReviewMergeModeValue = useCallback((mode: QuizUploadReviewMergeMode) => {
    setReviewMergeMode(mode)
    setUploadError(null)

    if (
      mode === 'existing'
      && !reviewExistingCollectionId
      && reviewExistingCollections.length > 0
    ) {
      setReviewExistingCollectionId(reviewExistingCollections[0].id)
    }
  }, [reviewExistingCollectionId, reviewExistingCollections])

  const setReviewNewCollectionNameValue = useCallback((name: string) => {
    setReviewNewCollectionName(name)
  }, [])

  const setReviewNewCollectionDescriptionValue = useCallback((description: string) => {
    setReviewNewCollectionDescription(description)
  }, [])

  const confirmUploadReview = useCallback(async () => {
    if (!accessToken) {
      setUploadError({
        title: 'Session expired',
        details: [QUIZ_AUTH_ERROR_MESSAGE],
      })
      return
    }

    if (reviewQuestions.length === 0) {
      setUploadError({
        title: 'No quiz questions to import',
        details: ['Upload a quiz JSON file before confirming import.'],
      })
      setScreen('upload')
      return
    }

    const trimmedNewCollectionName = reviewNewCollectionName.trim()
    const trimmedNewCollectionDescription = reviewNewCollectionDescription.trim()
    const collectionNameOverrides: Record<string, string> = {}

    if (reviewMergeMode === 'subject') {
      for (const collection of reviewCollections) {
        const trimmedCollectionName = collection.collectionName.trim()
        if (!trimmedCollectionName) {
          setUploadError({
            title: 'Collection name is required',
            details: ['Every detected subject must map to a non-empty collection name.'],
          })
          return
        }

        if (trimmedCollectionName !== collection.subject) {
          collectionNameOverrides[collection.subject] = trimmedCollectionName
        }
      }
    }

    if (reviewMergeMode === 'existing' && !reviewExistingCollectionId) {
      setUploadError({
        title: 'Merge target is required',
        details: ['Select an existing collection to merge imported questions into.'],
      })
      return
    }

    if (reviewMergeMode === 'new' && !trimmedNewCollectionName) {
      setUploadError({
        title: 'Collection name is required',
        details: ['Provide a name for the new merge target collection.'],
      })
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      let mergeIntoCollectionId: string | undefined

      if (reviewMergeMode === 'existing') {
        mergeIntoCollectionId = reviewExistingCollectionId ?? undefined
      }

      if (reviewMergeMode === 'new') {
        const createdCollection = await createQuizCollection({
          accessToken,
          name: trimmedNewCollectionName,
          description: trimmedNewCollectionDescription || null,
        })

        mergeIntoCollectionId = createdCollection.id
        setReviewExistingCollections((currentCollections) => [
          ...currentCollections,
          createdCollection,
        ])
        setReviewExistingCollectionId(createdCollection.id)
      }

      await persistQuizQuestionsBulk({
        accessToken,
        questions: reviewQuestions,
        collectionNameOverrides,
        mergeIntoCollectionId,
      })

      startQuizSession(reviewQuestions)
    } catch (error) {
      if (error instanceof QuizApiError) {
        console.error('[quiz.upload.review] persistence failed', {
          statusCode: error.statusCode,
          message: error.message,
          details: error.details,
        })

        const errorDetails =
          error.statusCode === 401
            ? [QUIZ_AUTH_ERROR_MESSAGE]
            : [error.message, ...formatQuizApiErrorDetails(error.details)]

        setUploadError({
          title: error.statusCode === 401 ? 'Session expired' : 'Quiz persistence failed',
          details: errorDetails,
        })
        return
      }

      setUploadError({
        title: 'Quiz persistence failed',
        details: ['An unexpected error occurred while importing quiz questions. Try again.'],
      })
    } finally {
      setIsUploading(false)
    }
  }, [
    accessToken,
    reviewCollections,
    reviewExistingCollectionId,
    reviewMergeMode,
    reviewNewCollectionDescription,
    reviewNewCollectionName,
    reviewQuestions,
    startQuizSession,
  ])

  const cancelUploadReview = useCallback(() => {
    setUploadError(null)
    resetQuizSession()
  }, [resetQuizSession])

  const requestOpenAnswerFeedback = useCallback(
    async ({
      questionIndex,
      quizSessionId,
      question,
      userAnswer,
      completeAnswer,
    }: OpenFeedbackRequest) => {
      if (!accessToken) {
        updateQuestionStateAtIndex(questionIndex, (currentState) => {
          if (
            currentState.feedback.status !== 'loading'
            || currentState.open.submittedAnswer !== userAnswer
          ) {
            return currentState
          }

          return {
            ...currentState,
            feedback: {
              status: 'error',
              message: QUIZ_AUTH_ERROR_MESSAGE,
            },
          }
        })
        return
      }

      try {
        const feedback = await fetchFeedback({
          accessToken,
          question,
          userAnswer,
          completeAnswer,
        })

        if (quizSessionIdRef.current !== quizSessionId) {
          return
        }

        updateQuestionStateAtIndex(questionIndex, (currentState) => {
          if (
            currentState.feedback.status !== 'loading'
            || currentState.open.submittedAnswer !== userAnswer
          ) {
            return currentState
          }

          return {
            ...currentState,
            feedback: {
              status: 'success',
              feedback,
            },
          }
        })
      } catch (error) {
        if (quizSessionIdRef.current !== quizSessionId) {
          return
        }

        const feedbackErrorMessage =
          error instanceof QuizApiError && error.statusCode === 401
            ? QUIZ_AUTH_ERROR_MESSAGE
            : QUIZ_FEEDBACK_ERROR_MESSAGE

        updateQuestionStateAtIndex(questionIndex, (currentState) => {
          if (
            currentState.feedback.status !== 'loading'
            || currentState.open.submittedAnswer !== userAnswer
          ) {
            return currentState
          }

          return {
            ...currentState,
            feedback: {
              status: 'error',
              message: feedbackErrorMessage,
            },
          }
        })
      }
    },
    [accessToken, updateQuestionStateAtIndex],
  )

  const setMode = useCallback((mode: QuizMode) => {
    updateCurrentQuestionState((currentState) => {
      if (currentState.mode === mode) {
        return currentState
      }

      return {
        ...currentState,
        mode,
      }
    })
  }, [updateCurrentQuestionState])

  const setOpenDraftAnswer = useCallback((answer: string) => {
    updateCurrentQuestionState((currentState) => {
      if (currentState.open.submittedAnswer !== null || currentState.open.draftAnswer === answer) {
        return currentState
      }

      return {
        ...currentState,
        open: {
          ...currentState.open,
          draftAnswer: answer,
        },
      }
    })
  }, [updateCurrentQuestionState])

  const submitOpenAnswer = useCallback(() => {
    const question = questions[actualQuestionIndex]
    const currentQuestionState = questionStates[actualQuestionIndex]

    if (!question || !currentQuestionState) {
      return
    }

    if (currentQuestionState.open.submittedAnswer !== null) {
      return
    }

    const submittedAnswer = currentQuestionState.open.draftAnswer.trim()
    if (!submittedAnswer) {
      return
    }

    const quizSessionId = quizSessionIdRef.current
    const submissionKey = `${quizSessionId}:${actualQuestionIndex}`

    if (openSubmissionKeysRef.current.has(submissionKey)) {
      return
    }

    openSubmissionKeysRef.current.add(submissionKey)

    updateQuestionStateAtIndex(actualQuestionIndex, (state) => {
      if (state.open.submittedAnswer !== null) {
        return state
      }

      return {
        ...state,
        open: {
          draftAnswer: submittedAnswer,
          submittedAnswer,
        },
        feedback: {
          status: 'loading',
        },
      }
    })

    void requestOpenAnswerFeedback({
      questionIndex: actualQuestionIndex,
      quizSessionId,
      question: question.question,
      userAnswer: submittedAnswer,
      completeAnswer: question.complete_answer,
    })
  }, [
    actualQuestionIndex,
    questionStates,
    questions,
    requestOpenAnswerFeedback,
    updateQuestionStateAtIndex,
  ])

  const selectMcqOption = useCallback(
    (optionIndex: number) => {
      const currentQuestion = questions[actualQuestionIndex]
      if (!Number.isInteger(optionIndex) || !currentQuestion) {
        return
      }

      if (optionIndex < 0 || optionIndex >= currentQuestion.mcq_options.length) {
        return
      }

      updateCurrentQuestionState((currentState) => {
        if (
          currentState.mcq.submittedOptionIndex !== null
          || currentState.mcq.selectedOptionIndex === optionIndex
        ) {
          return currentState
        }

        return {
          ...currentState,
          mcq: {
            ...currentState.mcq,
            selectedOptionIndex: optionIndex,
          },
        }
      })
    },
    [actualQuestionIndex, questions, updateCurrentQuestionState],
  )

  const submitMcqAnswer = useCallback(() => {
    updateCurrentQuestionState((currentState) => {
      if (currentState.mcq.submittedOptionIndex !== null) {
        return currentState
      }

      if (currentState.mcq.selectedOptionIndex === null) {
        return currentState
      }

      return {
        ...currentState,
        mcq: {
          ...currentState.mcq,
          submittedOptionIndex: currentState.mcq.selectedOptionIndex,
        },
      }
    })
  }, [updateCurrentQuestionState])

  const goToPreviousQuestion = useCallback(() => {
    setCurrentQuestionIndex((previousQuestionIndex) => Math.max(previousQuestionIndex - 1, 0))
  }, [])

  const goToNextQuestion = useCallback(() => {
    setCurrentQuestionIndex((previousQuestionIndex) => {
      if (filteredIndices.length === 0) {
        return previousQuestionIndex
      }

      return Math.min(previousQuestionIndex + 1, filteredIndices.length - 1)
    })
  }, [filteredIndices.length])

  const finishQuiz = useCallback(() => {
    setUploadError(null)
    resetQuizSession()
  }, [resetQuizSession])

  const returnToUpload = useCallback(() => {
    finishQuiz()
  }, [finishQuiz])

  const setSubjectFilter = useCallback((subject: string | null) => {
    setSelectedSubject(subject)
    setCurrentQuestionIndex(0)
  }, [])

  const openQuizChatHandoff = useCallback(() => {
    const currentQuestion = questions[actualQuestionIndex]
    const currentQuestionState = questionStates[actualQuestionIndex]

    if (!currentQuestion || !currentQuestionState) {
      return
    }

    const threadId = crypto.randomUUID()
    const prelude = buildQuizPrelude({
      question: currentQuestion,
      questionState: currentQuestionState,
    })

    setQuizChatThreadId(threadId)
    setQuizChatSystemContext(prelude)
    setIsQuizChatOpen(true)
  }, [actualQuestionIndex, questionStates, questions])

  const closeQuizChatHandoff = useCallback(() => {
    setIsQuizChatOpen(false)
    setQuizChatThreadId(null)
    setQuizChatSystemContext(null)
  }, [])

  const currentQuestion = useMemo(
    () => questions[actualQuestionIndex] ?? null,
    [questions, actualQuestionIndex],
  )

  const currentQuestionState = useMemo(
    () => questionStates[actualQuestionIndex] ?? null,
    [questionStates, actualQuestionIndex],
  )

  const mode = currentQuestionState?.mode ?? 'open'
  const openDraftAnswer = currentQuestionState?.open.draftAnswer ?? ''
  const submittedOpenAnswer = currentQuestionState?.open.submittedAnswer ?? null
  const feedbackState: QuizFeedbackState = currentQuestionState?.feedback ?? { status: 'idle' }
  const feedbackStatus = feedbackState.status
  const feedbackText = feedbackState.status === 'success' ? feedbackState.feedback : null
  const feedbackError = feedbackState.status === 'error' ? feedbackState.message : null
  const selectedMcqOptionIndex = currentQuestionState?.mcq.selectedOptionIndex ?? null
  const submittedMcqOptionIndex = currentQuestionState?.mcq.submittedOptionIndex ?? null
  const isOpenSubmitted = submittedOpenAnswer !== null
  const isMcqSubmitted = submittedMcqOptionIndex !== null
  const isFirstQuestion = currentQuestionIndex <= 0
  const isLastQuestion = filteredIndices.length > 0 && currentQuestionIndex >= filteredIndices.length - 1
  const canConfirmUploadReview = useMemo(() => {
    if (isUploading || reviewQuestions.length === 0) {
      return false
    }

    if (reviewMergeMode === 'existing') {
      return Boolean(reviewExistingCollectionId)
    }

    if (reviewMergeMode === 'new') {
      return reviewNewCollectionName.trim().length > 0
    }

    return reviewCollections.every((collection) => collection.collectionName.trim().length > 0)
  }, [
    isUploading,
    reviewCollections,
    reviewExistingCollectionId,
    reviewMergeMode,
    reviewNewCollectionName,
    reviewQuestions.length,
  ])

  return {
    screen,
    mode,
    isUploading,
    isLoadingReviewCollections,
    uploadError,
    reviewCollections,
    reviewMergeMode,
    reviewExistingCollections,
    reviewExistingCollectionId,
    reviewNewCollectionName,
    reviewNewCollectionDescription,
    reviewCollectionsLoadError,
    canConfirmUploadReview,
    questionCount: filteredIndices.length,
    totalQuestionCount: questions.length,
    currentQuestionIndex,
    availableSubjects,
    selectedSubject,
    currentQuestion,
    openDraftAnswer,
    submittedOpenAnswer,
    feedbackStatus,
    feedbackText,
    feedbackError,
    selectedMcqOptionIndex,
    submittedMcqOptionIndex,
    isOpenSubmitted,
    isMcqSubmitted,
    isFirstQuestion,
    isLastQuestion,
    isQuizChatOpen,
    quizChatThreadId,
    quizChatSystemContext,
    setMode,
    setOpenDraftAnswer,
    submitOpenAnswer,
    selectMcqOption,
    submitMcqAnswer,
    goToPreviousQuestion,
    goToNextQuestion,
    uploadQuizFile,
    setReviewCollectionName,
    setReviewMergeMode: setReviewMergeModeValue,
    setReviewExistingCollectionId: setReviewExistingCollectionIdValue,
    setReviewNewCollectionName: setReviewNewCollectionNameValue,
    setReviewNewCollectionDescription: setReviewNewCollectionDescriptionValue,
    refreshReviewCollections,
    confirmUploadReview,
    cancelUploadReview,
    setSubjectFilter,
    finishQuiz,
    returnToUpload,
    openQuizChatHandoff,
    closeQuizChatHandoff,
  }
}

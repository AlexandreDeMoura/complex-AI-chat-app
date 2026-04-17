import { useCallback, useMemo, useState } from 'react'
import { parseQuizUploadFile } from '@/features/quiz/data'
import type {
  QuizMode,
  QuizQuestion,
  QuizQuestionState,
  QuizScreen,
  QuizUploadError,
} from '@/features/quiz/model'

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
  }
}

export interface QuizViewModel {
  screen: QuizScreen
  mode: QuizMode
  isUploading: boolean
  uploadError: QuizUploadError | null
  questionCount: number
  currentQuestionIndex: number
  currentQuestion: QuizQuestion | null
  openDraftAnswer: string
  submittedOpenAnswer: string | null
  selectedMcqOptionIndex: number | null
  submittedMcqOptionIndex: number | null
  isOpenSubmitted: boolean
  isMcqSubmitted: boolean
  isFirstQuestion: boolean
  isLastQuestion: boolean
  setMode: (mode: QuizMode) => void
  setOpenDraftAnswer: (answer: string) => void
  submitOpenAnswer: () => void
  selectMcqOption: (optionIndex: number) => void
  submitMcqAnswer: () => void
  goToPreviousQuestion: () => void
  goToNextQuestion: () => void
  uploadQuizFile: (file: File | null) => Promise<void>
  finishQuiz: () => void
  returnToUpload: () => void
}

export function useQuizState(): QuizViewModel {
  const [screen, setScreen] = useState<QuizScreen>('upload')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [questionStates, setQuestionStates] = useState<QuizQuestionState[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [uploadError, setUploadError] = useState<QuizUploadError | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const resetQuizSession = useCallback(() => {
    setScreen('upload')
    setQuestions([])
    setQuestionStates([])
    setCurrentQuestionIndex(0)
  }, [])

  const updateCurrentQuestionState = useCallback(
    (update: (state: QuizQuestionState) => QuizQuestionState) => {
      setQuestionStates((previousQuestionStates) => {
        const currentState = previousQuestionStates[currentQuestionIndex]

        if (!currentState) {
          return previousQuestionStates
        }

        const nextState = update(currentState)
        if (nextState === currentState) {
          return previousQuestionStates
        }

        const nextQuestionStates = [...previousQuestionStates]
        nextQuestionStates[currentQuestionIndex] = nextState
        return nextQuestionStates
      })
    },
    [currentQuestionIndex],
  )

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

      setQuestions(uploadResult.questions)
      setQuestionStates(uploadResult.questions.map(() => createInitialQuestionState()))
      setCurrentQuestionIndex(0)
      setScreen('question')
      setUploadError(null)
    } catch {
      setUploadError({
        title: 'File processing failed',
        details: ['An unexpected error occurred while reading the file. Try again.'],
      })
      resetQuizSession()
    } finally {
      setIsUploading(false)
    }
  }, [resetQuizSession])

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
    updateCurrentQuestionState((currentState) => {
      if (currentState.open.submittedAnswer !== null) {
        return currentState
      }

      const draftAnswer = currentState.open.draftAnswer.trim()
      if (!draftAnswer) {
        return currentState
      }

      return {
        ...currentState,
        open: {
          draftAnswer,
          submittedAnswer: draftAnswer,
        },
      }
    })
  }, [updateCurrentQuestionState])

  const selectMcqOption = useCallback(
    (optionIndex: number) => {
      const currentQuestion = questions[currentQuestionIndex]
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
    [currentQuestionIndex, questions, updateCurrentQuestionState],
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
      if (questions.length === 0) {
        return previousQuestionIndex
      }

      return Math.min(previousQuestionIndex + 1, questions.length - 1)
    })
  }, [questions.length])

  const finishQuiz = useCallback(() => {
    setUploadError(null)
    resetQuizSession()
  }, [resetQuizSession])

  const returnToUpload = useCallback(() => {
    finishQuiz()
  }, [finishQuiz])

  const currentQuestion = useMemo(
    () => questions[currentQuestionIndex] ?? null,
    [questions, currentQuestionIndex],
  )

  const currentQuestionState = useMemo(
    () => questionStates[currentQuestionIndex] ?? null,
    [questionStates, currentQuestionIndex],
  )

  const mode = currentQuestionState?.mode ?? 'open'
  const openDraftAnswer = currentQuestionState?.open.draftAnswer ?? ''
  const submittedOpenAnswer = currentQuestionState?.open.submittedAnswer ?? null
  const selectedMcqOptionIndex = currentQuestionState?.mcq.selectedOptionIndex ?? null
  const submittedMcqOptionIndex = currentQuestionState?.mcq.submittedOptionIndex ?? null
  const isOpenSubmitted = submittedOpenAnswer !== null
  const isMcqSubmitted = submittedMcqOptionIndex !== null
  const isFirstQuestion = currentQuestionIndex <= 0
  const isLastQuestion = questions.length > 0 && currentQuestionIndex >= questions.length - 1

  return {
    screen,
    mode,
    isUploading,
    uploadError,
    questionCount: questions.length,
    currentQuestionIndex,
    currentQuestion,
    openDraftAnswer,
    submittedOpenAnswer,
    selectedMcqOptionIndex,
    submittedMcqOptionIndex,
    isOpenSubmitted,
    isMcqSubmitted,
    isFirstQuestion,
    isLastQuestion,
    setMode,
    setOpenDraftAnswer,
    submitOpenAnswer,
    selectMcqOption,
    submitMcqAnswer,
    goToPreviousQuestion,
    goToNextQuestion,
    uploadQuizFile,
    finishQuiz,
    returnToUpload,
  }
}

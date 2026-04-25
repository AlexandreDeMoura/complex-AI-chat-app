import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchFeedback,
  submitMcqAnswer as persistMcqAnswerAttempt,
  QuizApiError,
} from '@/features/quiz/data'
import type {
  QuizCollectionQuestion,
  QuizFeedbackState,
  QuizFeedbackStatus,
  QuizMode,
  QuizQuestionState,
} from '@/features/quiz/model'

const QUIZ_FEEDBACK_ERROR_MESSAGE =
  'Feedback is unavailable for this answer. You can continue the quiz.'
const QUIZ_AUTH_ERROR_MESSAGE =
  'Your session is no longer valid. Sign in again to continue with quiz actions.'

interface UseSessionQuestionViewModelOptions {
  accessToken: string | null
  question: QuizCollectionQuestion | null
}

export interface SessionQuestionViewModel {
  mode: QuizMode
  openDraftAnswer: string
  submittedOpenAnswer: string | null
  feedbackStatus: QuizFeedbackStatus
  feedbackText: string | null
  feedbackGrade: number | null
  feedbackError: string | null
  selectedMcqOptionIndex: number | null
  submittedMcqOptionIndex: number | null
  isOpenSubmitted: boolean
  isMcqSubmitted: boolean
  canGoToNextQuestion: boolean
  masteryLevel: number
  questionState: QuizQuestionState | null
  setMode: (mode: QuizMode) => void
  setOpenDraftAnswer: (answer: string) => void
  submitOpenAnswer: () => void
  selectMcqOption: (optionIndex: number) => void
  submitMcqAnswer: () => void
}

function normalizeMasteryLevel(value: number): number {
  if (!Number.isInteger(value)) {
    return 0
  }

  return Math.max(0, Math.min(5, value))
}

export function useSessionQuestionViewModel({
  accessToken,
  question,
}: UseSessionQuestionViewModelOptions): SessionQuestionViewModel {
  const [mode, setModeState] = useState<QuizMode>('open')
  const [openDraftAnswer, setOpenDraftAnswerState] = useState('')
  const [submittedOpenAnswer, setSubmittedOpenAnswer] = useState<string | null>(null)
  const [feedbackState, setFeedbackState] = useState<QuizFeedbackState>({ status: 'idle' })
  const [selectedMcqOptionIndex, setSelectedMcqOptionIndex] = useState<number | null>(null)
  const [submittedMcqOptionIndex, setSubmittedMcqOptionIndex] = useState<number | null>(null)
  const [masteryLevel, setMasteryLevel] = useState(() =>
    normalizeMasteryLevel(question?.masteryLevel ?? 0))
  const questionVersionRef = useRef(0)

  useEffect(() => {
    questionVersionRef.current += 1
    setModeState('open')
    setOpenDraftAnswerState('')
    setSubmittedOpenAnswer(null)
    setFeedbackState({ status: 'idle' })
    setSelectedMcqOptionIndex(null)
    setSubmittedMcqOptionIndex(null)
    setMasteryLevel(normalizeMasteryLevel(question?.masteryLevel ?? 0))
  }, [question?.id])

  useEffect(() => {
    if (!question) {
      return
    }

    const normalizedMasteryLevel = normalizeMasteryLevel(question.masteryLevel)
    setMasteryLevel((currentMasteryLevel) =>
      Math.max(currentMasteryLevel, normalizedMasteryLevel))
  }, [question?.id, question?.masteryLevel])

  const setMode = useCallback((nextMode: QuizMode) => {
    setModeState((currentMode) => (currentMode === nextMode ? currentMode : nextMode))
  }, [])

  const setOpenDraftAnswer = useCallback((answer: string) => {
    setOpenDraftAnswerState((currentAnswer) => {
      if (submittedOpenAnswer !== null || currentAnswer === answer) {
        return currentAnswer
      }

      return answer
    })
  }, [submittedOpenAnswer])

  const submitOpenAnswer = useCallback(() => {
    if (!question || submittedOpenAnswer !== null) {
      return
    }

    const normalizedAnswer = openDraftAnswer.trim()
    if (!normalizedAnswer) {
      return
    }

    const requestQuestionVersion = questionVersionRef.current
    const currentQuestionId = question.id

    setOpenDraftAnswerState(normalizedAnswer)
    setSubmittedOpenAnswer(normalizedAnswer)
    setFeedbackState({ status: 'loading' })

    if (!accessToken) {
      setFeedbackState({
        status: 'error',
        message: QUIZ_AUTH_ERROR_MESSAGE,
      })
      return
    }

    const requestFeedback = async () => {
      try {
        const result = await fetchFeedback({
          accessToken,
          questionId: currentQuestionId,
          question: question.question,
          userAnswer: normalizedAnswer,
          completeAnswer: question.completeAnswer,
        })

        if (questionVersionRef.current !== requestQuestionVersion) {
          return
        }

        setFeedbackState({
          status: 'success',
          feedback: result.feedback,
          grade: result.grade,
        })
        setMasteryLevel((currentMasteryLevel) =>
          Math.max(currentMasteryLevel, normalizeMasteryLevel(result.masteryLevel)))
      } catch (error) {
        if (questionVersionRef.current !== requestQuestionVersion) {
          return
        }

        const errorMessage =
          error instanceof QuizApiError && error.statusCode === 401
            ? QUIZ_AUTH_ERROR_MESSAGE
            : QUIZ_FEEDBACK_ERROR_MESSAGE

        setFeedbackState({
          status: 'error',
          message: errorMessage,
        })
      }
    }

    void requestFeedback()
  }, [
    accessToken,
    openDraftAnswer,
    question,
    submittedOpenAnswer,
  ])

  const selectMcqOption = useCallback((optionIndex: number) => {
    if (!question || submittedMcqOptionIndex !== null || !Number.isInteger(optionIndex)) {
      return
    }

    if (optionIndex < 0 || optionIndex >= question.mcqOptions.length) {
      return
    }

    setSelectedMcqOptionIndex((currentOptionIndex) =>
      currentOptionIndex === optionIndex ? currentOptionIndex : optionIndex)
  }, [question, submittedMcqOptionIndex])

  const submitMcqAnswer = useCallback(() => {
    if (!question || submittedMcqOptionIndex !== null || selectedMcqOptionIndex === null) {
      return
    }

    const selectedOption = question.mcqOptions[selectedMcqOptionIndex]
    if (!selectedOption) {
      return
    }

    const requestQuestionVersion = questionVersionRef.current
    setSubmittedMcqOptionIndex(selectedMcqOptionIndex)

    if (!accessToken) {
      return
    }

    const persistAttempt = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await persistMcqAnswerAttempt({
            accessToken,
            questionId: question.id,
            userAnswer: selectedOption.option,
            isCorrect: Boolean(selectedOption.is_correct),
          })

          if (questionVersionRef.current !== requestQuestionVersion) {
            return
          }

          setMasteryLevel((currentMasteryLevel) =>
            Math.max(currentMasteryLevel, normalizeMasteryLevel(result.masteryLevel)))
          return
        } catch (error) {
          const isUnauthorizedError = error instanceof QuizApiError && error.statusCode === 401
          const canRetry = attempt === 0 && !isUnauthorizedError
          if (canRetry) {
            continue
          }

          console.warn('[quiz.session.mcq] answer persistence failed', {
            questionId: question.id,
            attempt: attempt + 1,
            message: error instanceof Error ? error.message : String(error),
          })
          return
        }
      }
    }

    void persistAttempt()
  }, [
    accessToken,
    question,
    selectedMcqOptionIndex,
    submittedMcqOptionIndex,
  ])

  const feedbackStatus = feedbackState.status
  const feedbackText = feedbackState.status === 'success' ? feedbackState.feedback : null
  const feedbackGrade = feedbackState.status === 'success' ? feedbackState.grade : null
  const feedbackError = feedbackState.status === 'error' ? feedbackState.message : null
  const isOpenSubmitted = submittedOpenAnswer !== null
  const isMcqSubmitted = submittedMcqOptionIndex !== null
  const canGoToNextQuestion =
    isMcqSubmitted
    || (isOpenSubmitted && feedbackStatus !== 'loading')

  const questionState = useMemo<QuizQuestionState | null>(() => {
    if (!question) {
      return null
    }

    return {
      mode,
      open: {
        draftAnswer: openDraftAnswer,
        submittedAnswer: submittedOpenAnswer,
      },
      mcq: {
        selectedOptionIndex: selectedMcqOptionIndex,
        submittedOptionIndex: submittedMcqOptionIndex,
      },
      feedback: feedbackState,
    }
  }, [
    feedbackState,
    mode,
    openDraftAnswer,
    question,
    selectedMcqOptionIndex,
    submittedMcqOptionIndex,
    submittedOpenAnswer,
  ])

  return useMemo<SessionQuestionViewModel>(() => ({
    mode,
    openDraftAnswer,
    submittedOpenAnswer,
    feedbackStatus,
    feedbackText,
    feedbackGrade,
    feedbackError,
    selectedMcqOptionIndex,
    submittedMcqOptionIndex,
    isOpenSubmitted,
    isMcqSubmitted,
    canGoToNextQuestion,
    masteryLevel,
    questionState,
    setMode,
    setOpenDraftAnswer,
    submitOpenAnswer,
    selectMcqOption,
    submitMcqAnswer,
  }), [
    canGoToNextQuestion,
    feedbackError,
    feedbackGrade,
    feedbackStatus,
    feedbackText,
    isMcqSubmitted,
    isOpenSubmitted,
    masteryLevel,
    mode,
    openDraftAnswer,
    questionState,
    selectMcqOption,
    selectedMcqOptionIndex,
    setMode,
    setOpenDraftAnswer,
    submitMcqAnswer,
    submitOpenAnswer,
    submittedMcqOptionIndex,
    submittedOpenAnswer,
  ])
}

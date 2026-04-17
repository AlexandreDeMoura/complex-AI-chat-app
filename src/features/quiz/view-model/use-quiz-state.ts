import { useCallback, useMemo, useState } from 'react'
import { parseQuizUploadFile } from '@/features/quiz/data'
import type {
  QuizMode,
  QuizQuestion,
  QuizScreen,
  QuizUploadError,
} from '@/features/quiz/model'

export interface QuizViewModel {
  screen: QuizScreen
  mode: QuizMode
  isUploading: boolean
  uploadError: QuizUploadError | null
  questionCount: number
  currentQuestionIndex: number
  currentQuestion: QuizQuestion | null
  setMode: (mode: QuizMode) => void
  uploadQuizFile: (file: File | null) => Promise<void>
  returnToUpload: () => void
}

export function useQuizState(): QuizViewModel {
  const [screen, setScreen] = useState<QuizScreen>('upload')
  const [mode, setMode] = useState<QuizMode>('open')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [uploadError, setUploadError] = useState<QuizUploadError | null>(null)
  const [isUploading, setIsUploading] = useState(false)

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
        setQuestions([])
        setCurrentQuestionIndex(0)
        setScreen('upload')
        return
      }

      setQuestions(uploadResult.questions)
      setCurrentQuestionIndex(0)
      setMode('open')
      setScreen('question')
      setUploadError(null)
    } catch {
      setUploadError({
        title: 'File processing failed',
        details: ['An unexpected error occurred while reading the file. Try again.'],
      })
      setQuestions([])
      setCurrentQuestionIndex(0)
      setScreen('upload')
    } finally {
      setIsUploading(false)
    }
  }, [])

  const returnToUpload = useCallback(() => {
    setScreen('upload')
  }, [])

  const currentQuestion = useMemo(
    () => questions[currentQuestionIndex] ?? null,
    [questions, currentQuestionIndex],
  )

  return {
    screen,
    mode,
    isUploading,
    uploadError,
    questionCount: questions.length,
    currentQuestionIndex,
    currentQuestion,
    setMode,
    uploadQuizFile,
    returnToUpload,
  }
}

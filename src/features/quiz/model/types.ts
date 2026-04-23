export type QuizScreen = 'upload' | 'question'
export type QuizMode = 'open' | 'mcq'
export type QuizFeedbackStatus = 'idle' | 'loading' | 'success' | 'error'

export interface QuizUploadError {
  title: string
  details: string[]
}

export interface OpenModeAnswerState {
  draftAnswer: string
  submittedAnswer: string | null
}

export interface McqModeAnswerState {
  selectedOptionIndex: number | null
  submittedOptionIndex: number | null
}

export type QuizFeedbackState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; feedback: string }
  | { status: 'error'; message: string }

export interface QuizQuestionState {
  mode: QuizMode
  open: OpenModeAnswerState
  mcq: McqModeAnswerState
  feedback: QuizFeedbackState
}

export interface QuizCollectionSummary {
  id: string
  name: string
  description: string | null
  questionCount: number
  createdAt: string
  updatedAt: string
}

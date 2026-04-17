export type QuizScreen = 'upload' | 'question'
export type QuizMode = 'open' | 'mcq'

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

export interface QuizQuestionState {
  mode: QuizMode
  open: OpenModeAnswerState
  mcq: McqModeAnswerState
}

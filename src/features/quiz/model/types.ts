export type QuizScreen = 'upload' | 'question'
export type QuizMode = 'open' | 'mcq'

export interface QuizUploadError {
  title: string
  details: string[]
}

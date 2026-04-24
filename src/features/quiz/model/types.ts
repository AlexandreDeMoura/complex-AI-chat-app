import type { QuizOption, QuizQuestion } from '@/features/quiz/model/schema'

export type QuizScreen = 'upload' | 'review' | 'question'
export type QuizMode = 'open' | 'mcq'
export type QuizFeedbackStatus = 'idle' | 'loading' | 'success' | 'error'
export type OrphanStrategy = 'delete' | 'reassign'
export type QuizUploadReviewMergeMode = 'subject' | 'existing' | 'new'

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

export interface QuizFeedbackSuccessState {
  status: 'success'
  feedback: string
  grade: number | null
}

export type QuizFeedbackState =
  | { status: 'idle' }
  | { status: 'loading' }
  | QuizFeedbackSuccessState
  | { status: 'error'; message: string }

export interface QuizQuestionState {
  mode: QuizMode
  open: OpenModeAnswerState
  mcq: McqModeAnswerState
  feedback: QuizFeedbackState
}

export interface QuizUploadReviewCollection {
  subject: string
  questionCount: number
  collectionName: string
}

export interface QuizCollectionSummary {
  id: string
  name: string
  description: string | null
  questionCount: number
  createdAt: string
  updatedAt: string
}

export interface QuizCollectionQuestion {
  id: string
  question: string
  mcqQuestion: string
  completeAnswer: string
  mcqOptions: QuizOption[]
  subject: string
  difficulty: number
  masteryLevel: number
  createdAt: string
  updatedAt: string
}

export interface QuizCollectionDeleteResult {
  id: string
  orphanQuestionIds: string[]
  deletedQuestionIds: string[]
  reassignedQuestionIds: string[]
}

export interface QuizCollectionQuestionRemovalResult {
  collectionId: string
  questionId: string
  orphanQuestionIds: string[]
  deletedQuestionIds: string[]
  reassignedQuestionIds: string[]
}

export interface QuizCollectionQuestionLinkResult {
  collectionId: string
  questionIds: string[]
}

export interface QuizQuestionDeleteResult {
  id: string
}

export interface QuizSessionQuestion extends QuizQuestion {
  id: string
  masteryLevel: number
}

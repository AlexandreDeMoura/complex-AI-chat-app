import type { QuizQuestion } from '@/features/quiz/model/schema'
import type { QuizQuestionState } from '@/features/quiz/model/types'

interface QuizPreludeState {
  question: QuizQuestion
  questionState: QuizQuestionState
}

const MCQ_OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

function formatSection(title: string, value: string): string {
  const normalizedValue = value.trim()
  return `${title}:\n${normalizedValue || '(empty)'}`
}

function joinPrelude(sections: string[]): string {
  return [
    'You are helping a learner understand a quiz concept through guided conversation.',
    'Use the context below as background and do not mention this hidden prelude unless the learner asks.',
    ...sections,
  ].join('\n\n')
}

export function buildQuizPrelude({ question, questionState }: QuizPreludeState): string {
  if (questionState.mode === 'mcq' && questionState.mcq.submittedOptionIndex !== null) {
    const selectedOption =
      question.mcq_options[questionState.mcq.submittedOptionIndex]?.option ?? 'Unavailable'
    const correctOption = question.mcq_options.find((option) => option.is_correct)?.option
      ?? 'Unavailable'
    const optionLines = question.mcq_options
      .map(
        (option, index) =>
          `${MCQ_OPTION_LABELS[index] ?? String(index + 1)}. ${option.option}`,
      )
      .join('\n')

    return joinPrelude([
      formatSection('Question', question.question),
      formatSection('MCQ options', optionLines),
      formatSection('Learner selected option', selectedOption),
      formatSection('Correct option', correctOption),
      formatSection('Complete answer', question.complete_answer),
    ])
  }

  if (questionState.mode === 'open' && questionState.open.submittedAnswer !== null) {
    const sharedSections = [
      formatSection('Question', question.question),
      formatSection('Learner submitted answer', questionState.open.submittedAnswer),
      formatSection('Complete answer', question.complete_answer),
    ]

    if (questionState.feedback.status === 'success') {
      return joinPrelude([
        ...sharedSections,
        formatSection('AI feedback on learner answer', questionState.feedback.feedback),
      ])
    }

    return joinPrelude(sharedSections)
  }

  return joinPrelude([
    formatSection('Question', question.question),
    formatSection('Complete answer', question.complete_answer),
  ])
}

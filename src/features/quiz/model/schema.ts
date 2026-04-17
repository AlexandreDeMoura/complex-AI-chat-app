import { z } from 'zod'

const quizOptionSchema = z.object({
  option: z.string(),
  is_correct: z.boolean(),
}).strict()

const quizQuestionBaseSchema = z.object({
  question: z.string(),
  mcq_question: z.string(),
  complete_answer: z.string(),
  mcq_options: z.array(quizOptionSchema).length(4, {
    message: 'Expected exactly 4 options in mcq_options.',
  }),
  subject: z.string(),
  difficulty: z.number(),
}).strict()

export const quizQuestionSchema = quizQuestionBaseSchema.superRefine((question, ctx) => {
  const correctOptionsCount = question.mcq_options.reduce((count, option) =>
    option.is_correct ? count + 1 : count, 0)

  if (correctOptionsCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mcq_options'],
      message: `Expected exactly 1 correct option in mcq_options, found ${correctOptionsCount}.`,
    })
  }
})

export const quizSchema = z.array(quizQuestionSchema).min(1, {
  message: 'The quiz file must include at least one question.',
})

export type QuizOption = z.infer<typeof quizOptionSchema>
export type QuizQuestion = z.infer<typeof quizQuestionSchema>

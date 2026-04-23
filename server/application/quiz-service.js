import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { extractMessageText } from '../domain/message-utils.js'
import {
  persistBulkQuestions,
  QuizQuestionRepositoryError,
} from '../infrastructure/question-repository.js'

const QUIZ_FEEDBACK_MODEL_ID = 'claude-sonnet-4-6'
const QUIZ_FEEDBACK_TIMEOUT_MS = 30_000

const QUIZ_FEEDBACK_SYSTEM_PROMPT = `
You are a supportive pedagogy tutor.
Compare the student's answer to the expected reference answer.
Always highlight what the student got right.
Then explain omissions, mistakes, or reasoning gaps.
Reply in the same language as the question.
Keep the feedback concise and under 5 sentences.
Do not paraphrase the full reference answer; focus on the gap analysis.
`.trim()

let quizFeedbackModel = null

export class QuizFeedbackError extends Error {
  constructor(message, { statusCode = 500, cause } = {}) {
    super(message, { cause })
    this.name = 'QuizFeedbackError'
    this.statusCode = statusCode
  }
}

export class QuizBulkPersistenceError extends Error {
  constructor(message, { statusCode = 500, cause, details = null } = {}) {
    super(message, { cause })
    this.name = 'QuizBulkPersistenceError'
    this.statusCode = statusCode
    this.details = details
  }
}

const getQuizFeedbackModel = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new QuizFeedbackError('ANTHROPIC_API_KEY is not configured.', { statusCode: 500 })
  }

  if (!quizFeedbackModel) {
    quizFeedbackModel = new ChatAnthropic({
      model: QUIZ_FEEDBACK_MODEL_ID,
      apiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.2,
    })
  }

  return quizFeedbackModel
}

const buildFeedbackUserPrompt = ({ question, userAnswer, completeAnswer }) => `
Question:
${question}

Student answer:
${userAnswer}

Reference answer:
${completeAnswer}
`.trim()

const isAbortError = (error) => {
  if (!(error instanceof Error)) {
    return false
  }

  return error.name === 'AbortError' || error.name === 'TimeoutError'
}

export const generateQuizFeedback = async ({ question, userAnswer, completeAnswer }) => {
  const model = getQuizFeedbackModel()
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), QUIZ_FEEDBACK_TIMEOUT_MS)

  try {
    const response = await model.invoke(
      [
        new SystemMessage(QUIZ_FEEDBACK_SYSTEM_PROMPT),
        new HumanMessage(buildFeedbackUserPrompt({ question, userAnswer, completeAnswer })),
      ],
      { signal: abortController.signal },
    )

    const feedback = extractMessageText(response.content).trim()
    if (!feedback) {
      throw new QuizFeedbackError('Model returned an empty feedback response.', { statusCode: 502 })
    }

    return feedback
  } catch (error) {
    if (abortController.signal.aborted || isAbortError(error)) {
      throw new QuizFeedbackError('Quiz feedback generation timed out after 30 seconds.', {
        statusCode: 504,
        cause: error,
      })
    }

    if (error instanceof QuizFeedbackError) {
      throw error
    }

    throw new QuizFeedbackError('Quiz feedback provider request failed.', {
      statusCode: 502,
      cause: error,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export const persistQuizQuestionsBulk = async ({ accessToken, userId, questions }) => {
  if (!userId) {
    throw new QuizBulkPersistenceError('Quiz question persistence requires authentication.', {
      statusCode: 401,
    })
  }

  if (!accessToken) {
    throw new QuizBulkPersistenceError('Quiz question persistence requires a valid token.', {
      statusCode: 401,
    })
  }

  try {
    const result = await persistBulkQuestions({
      accessToken,
      questions,
    })

    return {
      userId,
      questionIds: result.questionIds,
      collectionIds: result.collectionIds,
    }
  } catch (error) {
    if (error instanceof QuizQuestionRepositoryError) {
      throw new QuizBulkPersistenceError(error.message, {
        statusCode: error.statusCode,
        cause: error,
        details: error.details,
      })
    }

    throw new QuizBulkPersistenceError('Quiz question bulk persistence failed.', {
      statusCode: 500,
      cause: error,
    })
  }
}

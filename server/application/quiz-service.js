import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { extractMessageText } from '../domain/message-utils.js'
import {
  addQuestionsToCollection,
  createCollection,
  deleteQuestion,
  deleteCollectionWithOrphanStrategy,
  listCollectionQuestions,
  listCollectionsWithCounts,
  persistBulkQuestions,
  QuizQuestionRepositoryError,
  removeQuestionFromCollection,
  searchQuestions,
  updateQuestion,
  updateCollection,
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

export class QuizCollectionError extends Error {
  constructor(message, { statusCode = 500, cause, details = null } = {}) {
    super(message, { cause })
    this.name = 'QuizCollectionError'
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

const assertQuizCollectionAuth = ({ accessToken, userId }) => {
  if (!userId) {
    throw new QuizCollectionError('Quiz collection access requires authentication.', {
      statusCode: 401,
    })
  }

  if (!accessToken) {
    throw new QuizCollectionError('Quiz collection access requires a valid token.', {
      statusCode: 401,
    })
  }
}

const toQuizCollectionError = (error, fallbackMessage) => {
  if (error instanceof QuizCollectionError) {
    return error
  }

  if (error instanceof QuizQuestionRepositoryError) {
    return new QuizCollectionError(error.message, {
      statusCode: error.statusCode,
      cause: error,
      details: error.details,
    })
  }

  return new QuizCollectionError(fallbackMessage, { statusCode: 500, cause: error })
}

export const listQuizCollections = async ({ accessToken, userId }) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const collections = await listCollectionsWithCounts({ accessToken })
    return { collections }
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz collection listing failed.')
  }
}

export const createQuizCollection = async ({ accessToken, userId, name, description }) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const collection = await createCollection({ accessToken, userId, name, description })
    return { collection }
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz collection creation failed.')
  }
}

export const updateQuizCollection = async ({
  accessToken,
  userId,
  collectionId,
  name,
  description,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const collection = await updateCollection({ accessToken, collectionId, name, description })
    return { collection }
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz collection update failed.')
  }
}

export const deleteQuizCollection = async ({
  accessToken,
  userId,
  collectionId,
  orphanStrategy,
  targetCollectionId,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const result = await deleteCollectionWithOrphanStrategy({
      accessToken,
      collectionId,
      orphanStrategy,
      targetCollectionId,
    })
    return result
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz collection deletion failed.')
  }
}

export const listQuizCollectionQuestions = async ({ accessToken, userId, collectionId }) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const questions = await listCollectionQuestions({ accessToken, collectionId })
    return { questions }
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz collection question listing failed.')
  }
}

export const addQuizQuestionsToCollection = async ({
  accessToken,
  userId,
  collectionId,
  questionIds,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    return await addQuestionsToCollection({ accessToken, collectionId, questionIds })
  } catch (error) {
    throw toQuizCollectionError(error, 'Adding questions to quiz collection failed.')
  }
}

export const removeQuizQuestionFromCollection = async ({
  accessToken,
  userId,
  collectionId,
  questionId,
  orphanStrategy,
  targetCollectionId,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    return await removeQuestionFromCollection({
      accessToken,
      collectionId,
      questionId,
      orphanStrategy,
      targetCollectionId,
    })
  } catch (error) {
    throw toQuizCollectionError(error, 'Removing question from quiz collection failed.')
  }
}

export const searchQuizQuestions = async ({
  accessToken,
  userId,
  search,
  excludeCollectionId,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const questions = await searchQuestions({
      accessToken,
      search,
      excludeCollectionId,
    })
    return { questions }
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz question search failed.')
  }
}

export const updateQuizQuestion = async ({
  accessToken,
  userId,
  questionId,
  question,
  mcqQuestion,
  completeAnswer,
  mcqOptions,
  subject,
  difficulty,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const updatedQuestion = await updateQuestion({
      accessToken,
      questionId,
      question,
      mcqQuestion,
      completeAnswer,
      mcqOptions,
      subject,
      difficulty,
    })

    return { question: updatedQuestion }
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz question update failed.')
  }
}

export const deleteQuizQuestion = async ({ accessToken, userId, questionId }) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    return await deleteQuestion({ accessToken, questionId })
  } catch (error) {
    throw toQuizCollectionError(error, 'Quiz question deletion failed.')
  }
}

export const persistQuizQuestionsBulk = async ({
  accessToken,
  userId,
  questions,
  collectionNameOverrides,
  mergeIntoCollectionId,
}) => {
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
      collectionNameOverrides,
      mergeIntoCollectionId,
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

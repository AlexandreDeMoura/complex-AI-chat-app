import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  parseQuizGradingResponse,
  parseQuizGradingResponseWithSingleRetry,
  QuizGradingParseError,
} from '../domain/grading-parser.js'
import { computeMastery } from '../domain/mastery.js'
import { extractMessageText } from '../domain/message-utils.js'
import {
  addQuestionsToCollection,
  createCollection,
  deleteQuestion,
  deleteCollectionWithOrphanStrategy,
  getCachedMasteryLevelForQuestion,
  insertAnswerHistoryAttempt,
  listCollectionQuestions,
  listCollectionsWithCounts,
  listAnswerHistoryForQuestion,
  persistBulkQuestions,
  QuizQuestionRepositoryError,
  removeQuestionFromCollection,
  searchQuestions,
  upsertMasteryLevelForQuestion,
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
Assign an integer grade from 0 to 5 using this rubric:
0 = no answer, irrelevant, or fundamentally wrong.
1 = vague awareness but misses the core concept.
2 = right area identified but incomplete or significantly incorrect.
3 = solid core understanding with minor errors or missing nuances.
4 = thorough and accurate with only minor omissions.
5 = complete, accurate, and clearly articulated reference-quality answer.
Return only valid JSON with this exact shape: {"feedback":"string","grade":number}
Do not add markdown, code fences, or explanatory text.
`.trim()

let quizFeedbackModel = null

export class QuizFeedbackError extends Error {
  constructor(message, { statusCode = 500, cause } = {}) {
    super(message, { cause })
    this.name = 'QuizFeedbackError'
    this.statusCode = statusCode
  }
}

export class QuizAnswerPersistenceError extends Error {
  constructor(message, { statusCode = 500, cause, details = null } = {}) {
    super(message, { cause })
    this.name = 'QuizAnswerPersistenceError'
    this.statusCode = statusCode
    this.details = details
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

const buildFeedbackRetryUserPrompt = ({ question, userAnswer, completeAnswer, invalidResponse }) => `
Your previous response could not be parsed as valid JSON.
Return only valid JSON exactly matching {"feedback":"string","grade":number}.

Previous invalid response:
${invalidResponse}

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

const invokeQuizFeedbackModel = async ({ model, userPrompt }) => {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), QUIZ_FEEDBACK_TIMEOUT_MS)

  try {
    const response = await model.invoke(
      [
        new SystemMessage(QUIZ_FEEDBACK_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ],
      { signal: abortController.signal },
    )

    const rawResponse = extractMessageText(response.content).trim()
    if (!rawResponse) {
      throw new QuizFeedbackError('Model returned an empty feedback response.', { statusCode: 502 })
    }

    return rawResponse
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

const assertQuizAnswerAuth = ({ accessToken, userId }) => {
  if (!userId) {
    throw new QuizAnswerPersistenceError('Quiz answer persistence requires authentication.', {
      statusCode: 401,
    })
  }

  if (!accessToken) {
    throw new QuizAnswerPersistenceError('Quiz answer persistence requires a valid token.', {
      statusCode: 401,
    })
  }
}

const toQuizAnswerPersistenceError = (error, fallbackMessage) => {
  if (error instanceof QuizAnswerPersistenceError) {
    return error
  }

  if (error instanceof QuizQuestionRepositoryError) {
    return new QuizAnswerPersistenceError(error.message, {
      statusCode: error.statusCode,
      cause: error,
      details: error.details,
    })
  }

  return new QuizAnswerPersistenceError(fallbackMessage, {
    statusCode: 500,
    cause: error,
  })
}

const recomputeMasteryLevelForQuestion = async ({ accessToken, userId, questionId }) => {
  const answerHistory = await listAnswerHistoryForQuestion({
    accessToken,
    userId,
    questionId,
  })
  const currentCachedLevel = await getCachedMasteryLevelForQuestion({
    accessToken,
    userId,
    questionId,
  })
  const computedMasteryLevel = computeMastery(answerHistory, currentCachedLevel)

  return upsertMasteryLevelForQuestion({
    accessToken,
    userId,
    questionId,
    masteryLevel: computedMasteryLevel,
  })
}

export const generateQuizFeedback = async ({ question, userAnswer, completeAnswer }) => {
  const model = getQuizFeedbackModel()
  const initialResponse = await invokeQuizFeedbackModel({
    model,
    userPrompt: buildFeedbackUserPrompt({ question, userAnswer, completeAnswer }),
  })

  try {
    return parseQuizGradingResponse(initialResponse)
  } catch (error) {
    if (!(error instanceof QuizGradingParseError)) {
      throw error
    }

    let retryResponse = ''
    try {
      retryResponse = await invokeQuizFeedbackModel({
        model,
        userPrompt: buildFeedbackRetryUserPrompt({
          question,
          userAnswer,
          completeAnswer,
          invalidResponse: initialResponse,
        }),
      })
    } catch {
      return {
        feedback: initialResponse,
        grade: null,
      }
    }

    return parseQuizGradingResponseWithSingleRetry({
      initialResponse,
      retryResponse,
    })
  }
}

export const submitQuizOpenAnswer = async ({
  accessToken,
  userId,
  questionId,
  question,
  userAnswer,
  completeAnswer,
}) => {
  assertQuizAnswerAuth({ accessToken, userId })

  const grading = await generateQuizFeedback({
    question,
    userAnswer,
    completeAnswer,
  })

  try {
    await insertAnswerHistoryAttempt({
      accessToken,
      userId,
      questionId,
      mode: 'open',
      userAnswer,
      grade: grading.grade,
      aiFeedback: grading.feedback,
    })

    const masteryLevel = await recomputeMasteryLevelForQuestion({
      accessToken,
      userId,
      questionId,
    })

    return {
      feedback: grading.feedback,
      grade: grading.grade,
      masteryLevel,
    }
  } catch (error) {
    throw toQuizAnswerPersistenceError(error, 'Persisting open quiz answer failed.')
  }
}

export const submitQuizMcqAnswer = async ({
  accessToken,
  userId,
  questionId,
  userAnswer,
  isCorrect,
}) => {
  assertQuizAnswerAuth({ accessToken, userId })

  try {
    await insertAnswerHistoryAttempt({
      accessToken,
      userId,
      questionId,
      mode: 'mcq',
      userAnswer,
      isCorrect,
    })

    const masteryLevel = await recomputeMasteryLevelForQuestion({
      accessToken,
      userId,
      questionId,
    })

    return { masteryLevel }
  } catch (error) {
    throw toQuizAnswerPersistenceError(error, 'Persisting MCQ quiz answer failed.')
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

export const listQuizCollectionQuestions = async ({
  accessToken,
  userId,
  collectionId,
  masteryLevels,
  difficultyLevels,
}) => {
  assertQuizCollectionAuth({ accessToken, userId })

  try {
    const questions = await listCollectionQuestions({
      accessToken,
      collectionId,
      masteryLevels,
      difficultyLevels,
    })
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

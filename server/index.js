import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { z } from 'zod'
import { sendMessage, streamMessage, resumeStream } from './application/chat-service.js'
import {
  addQuizQuestionsToCollection,
  deleteQuizQuestion,
  QuizBulkPersistenceError,
  QuizCollectionError,
  QuizFeedbackError,
  createQuizCollection,
  deleteQuizCollection,
  generateQuizFeedback,
  listQuizCollectionQuestions,
  listQuizCollections,
  persistQuizQuestionsBulk,
  removeQuizQuestionFromCollection,
  searchQuizQuestions,
  updateQuizQuestion,
  updateQuizCollection,
} from './application/quiz-service.js'
import { listThreads } from './application/thread-service.js'
import { getAvailableModels, THINKING_EFFORT_VALUES } from './infrastructure/agent.js'
import { requireQuizAuth } from './interface/quiz-auth-middleware.js'

const app = express()
const port = Number(process.env.PORT ?? 8788)

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.'),
  threadId: z.string().trim().min(1, 'threadId is required.'),
  model: z.string().optional(),
  thinkingEffort: z.enum(THINKING_EFFORT_VALUES).catch('off').optional(),
})

const streamRequestSchema = chatRequestSchema.extend({
  systemContext: z.string().trim().min(1, 'systemContext cannot be empty.').optional(),
})

const resumeSchema = z.object({
  threadId: z.string().trim().min(1, 'threadId is required.'),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
})

const quizFeedbackSchema = z
  .object({
    question: z.string().trim().min(1, 'question is required.'),
    user_answer: z.string().trim().min(1, 'user_answer is required.'),
    complete_answer: z.string().trim().min(1, 'complete_answer is required.'),
  })
  .strict()

const quizOptionSchema = z
  .object({
    option: z.string().trim().min(1, 'option is required.'),
    is_correct: z.boolean(),
  })
  .strict()

const quizQuestionSchema = z
  .object({
    question: z.string().trim().min(1, 'question is required.'),
    mcq_question: z.string().trim().min(1, 'mcq_question is required.'),
    complete_answer: z.string().trim().min(1, 'complete_answer is required.'),
    mcq_options: z
      .array(quizOptionSchema)
      .length(4, 'mcq_options must contain exactly 4 options.'),
    subject: z.string().trim().min(1, 'subject is required.'),
    difficulty: z
      .number()
      .int('difficulty must be an integer.')
      .min(-32768)
      .max(32767),
  })
  .strict()
  .superRefine((question, ctx) => {
    const correctOptions = question.mcq_options.filter((option) => option.is_correct).length
    if (correctOptions !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mcq_options'],
        message: 'mcq_options must include exactly one correct option.',
      })
    }
  })

const collectionNameOverridesSchema = z.record(
  z.string().trim().min(1, 'collection_name_overrides values must be non-empty strings.'),
)

const quizBulkQuestionsSchema = z
  .object({
    questions: z.array(quizQuestionSchema).min(1, 'At least one quiz question is required.'),
    collection_name_overrides: collectionNameOverridesSchema.optional(),
    merge_into_collection_id: z.string().trim().min(1, 'merge_into_collection_id is required.').optional(),
  })
  .strict()

const collectionDescriptionSchema = z.union([z.string(), z.null()])

const collectionCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required.'),
    description: collectionDescriptionSchema.optional(),
  })
  .strict()

const collectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required.').optional(),
    description: collectionDescriptionSchema.optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.description !== undefined,
    { message: 'At least one of "name" or "description" must be provided.' },
  )

const collectionDeleteQuerySchema = z
  .object({
    orphan_strategy: z.enum(['delete', 'reassign']).optional(),
    target: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) => data.orphan_strategy !== 'reassign' || Boolean(data.target),
    {
      message: 'target is required when orphan_strategy is "reassign".',
      path: ['target'],
    },
  )

const collectionIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Collection id is required.'),
})

const collectionQuestionIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Collection id is required.'),
  question_id: z.string().trim().min(1, 'Question id is required.'),
})

const questionIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Question id is required.'),
})

const collectionQuestionLinkSchema = z
  .object({
    question_ids: z.array(z.string().trim().min(1, 'question_ids entries are required.')).min(
      1,
      'At least one question_id is required.',
    ),
  })
  .strict()

const questionSearchQuerySchema = z
  .object({
    search: z.string().optional(),
    exclude_collection: z.string().trim().min(1).optional(),
  })
  .strict()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/threads', (_req, res) => {
  try {
    res.json(listThreads())
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error.'
    res.status(400).json({ error: message })
  }
})

const resolveRequestModel = (requestedModel) => {
  const models = getAvailableModels()
  if (models.length === 0) {
    throw new Error('No models are available. Configure at least one provider API key.')
  }

  if (!requestedModel) {
    return models[0].id
  }

  if (models.some((model) => model.id === requestedModel)) {
    return requestedModel
  }

  throw new Error(`Model "${requestedModel}" is not available.`)
}

app.get('/api/models', (_req, res) => {
  try {
    res.json(getAvailableModels())
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error.'
    res.status(400).json({ error: message })
  }
})

const formatValidationIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))

const sendValidationError = (res, error, message) => {
  res.status(400).json({
    error: message,
    issues: formatValidationIssues(error),
  })
}

const sendQuizCollectionError = (res, error, logLabel) => {
  if (error instanceof QuizCollectionError) {
    const body = { error: error.message }
    if (error.details) {
      body.details = error.details
    }
    res.status(error.statusCode).json(body)
    return
  }

  console.error(`[${logLabel}] unexpected error`, error)
  const message = error instanceof Error ? error.message : 'Unknown server error.'
  res.status(500).json({ error: message })
}

const quizRouter = express.Router()
quizRouter.use(requireQuizAuth)

quizRouter.post('/feedback', async (req, res) => {
  const payload = quizFeedbackSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({
      error: 'Invalid quiz feedback payload.',
      issues: formatValidationIssues(payload.error),
    })
    return
  }

  try {
    const feedback = await generateQuizFeedback({
      question: payload.data.question,
      userAnswer: payload.data.user_answer,
      completeAnswer: payload.data.complete_answer,
    })

    res.json({ feedback })
  } catch (error) {
    if (error instanceof QuizFeedbackError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }

    const message =
      error instanceof Error ? error.message : 'Unknown server error.'
    res.status(500).json({ error: message })
  }
})

quizRouter.post('/questions/bulk', async (req, res) => {
  const payload = quizBulkQuestionsSchema.safeParse(req.body)
  if (!payload.success) {
    res.status(400).json({
      error: 'Invalid quiz questions payload.',
      issues: formatValidationIssues(payload.error),
    })
    return
  }

  const userId = typeof req.userId === 'string' ? req.userId : ''
  const accessToken = typeof req.accessToken === 'string' ? req.accessToken : ''

  try {
    const result = await persistQuizQuestionsBulk({
      accessToken,
      userId,
      questions: payload.data.questions,
      collectionNameOverrides: payload.data.collection_name_overrides,
      mergeIntoCollectionId: payload.data.merge_into_collection_id,
    })

    res.status(201).json(result)
  } catch (error) {
    if (error instanceof QuizBulkPersistenceError) {
      console.error('[quiz.bulk] persistence failed', {
        statusCode: error.statusCode,
        message: error.message,
        details: error.details,
        cause: error.cause,
      })
      const body = { error: error.message }
      if (error.details) {
        body.details = error.details
      }
      res.status(error.statusCode).json(body)
      return
    }

    console.error('[quiz.bulk] unexpected error', error)
    const message =
      error instanceof Error ? error.message : 'Unknown server error.'
    res.status(500).json({ error: message })
  }
})

quizRouter.get('/collections', async (req, res) => {
  try {
    const result = await listQuizCollections({
      accessToken: req.accessToken,
      userId: req.userId,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.list')
  }
})

quizRouter.post('/collections', async (req, res) => {
  const payload = collectionCreateSchema.safeParse(req.body)
  if (!payload.success) {
    sendValidationError(res, payload.error, 'Invalid collection payload.')
    return
  }

  try {
    const result = await createQuizCollection({
      accessToken: req.accessToken,
      userId: req.userId,
      name: payload.data.name,
      description: payload.data.description,
    })
    res.status(201).json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.create')
  }
})

quizRouter.patch('/collections/:id', async (req, res) => {
  const params = collectionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid collection id.')
    return
  }

  const payload = collectionUpdateSchema.safeParse(req.body)
  if (!payload.success) {
    sendValidationError(res, payload.error, 'Invalid collection update payload.')
    return
  }

  try {
    const result = await updateQuizCollection({
      accessToken: req.accessToken,
      userId: req.userId,
      collectionId: params.data.id,
      name: payload.data.name,
      description: payload.data.description,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.update')
  }
})

quizRouter.delete('/collections/:id', async (req, res) => {
  const params = collectionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid collection id.')
    return
  }

  const query = collectionDeleteQuerySchema.safeParse(req.query)
  if (!query.success) {
    sendValidationError(res, query.error, 'Invalid collection delete query.')
    return
  }

  try {
    const result = await deleteQuizCollection({
      accessToken: req.accessToken,
      userId: req.userId,
      collectionId: params.data.id,
      orphanStrategy: query.data.orphan_strategy,
      targetCollectionId: query.data.target,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.delete')
  }
})

quizRouter.get('/collections/:id/questions', async (req, res) => {
  const params = collectionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid collection id.')
    return
  }

  try {
    const result = await listQuizCollectionQuestions({
      accessToken: req.accessToken,
      userId: req.userId,
      collectionId: params.data.id,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.questions.list')
  }
})

quizRouter.post('/collections/:id/questions', async (req, res) => {
  const params = collectionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid collection id.')
    return
  }

  const payload = collectionQuestionLinkSchema.safeParse(req.body)
  if (!payload.success) {
    sendValidationError(res, payload.error, 'Invalid collection question payload.')
    return
  }

  try {
    const result = await addQuizQuestionsToCollection({
      accessToken: req.accessToken,
      userId: req.userId,
      collectionId: params.data.id,
      questionIds: payload.data.question_ids,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.questions.add')
  }
})

quizRouter.delete('/collections/:id/questions/:question_id', async (req, res) => {
  const params = collectionQuestionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid collection/question id.')
    return
  }

  const query = collectionDeleteQuerySchema.safeParse(req.query)
  if (!query.success) {
    sendValidationError(res, query.error, 'Invalid collection question delete query.')
    return
  }

  try {
    const result = await removeQuizQuestionFromCollection({
      accessToken: req.accessToken,
      userId: req.userId,
      collectionId: params.data.id,
      questionId: params.data.question_id,
      orphanStrategy: query.data.orphan_strategy,
      targetCollectionId: query.data.target,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.collections.questions.remove')
  }
})

quizRouter.get('/questions', async (req, res) => {
  const query = questionSearchQuerySchema.safeParse(req.query)
  if (!query.success) {
    sendValidationError(res, query.error, 'Invalid question search query.')
    return
  }

  try {
    const result = await searchQuizQuestions({
      accessToken: req.accessToken,
      userId: req.userId,
      search: query.data.search,
      excludeCollectionId: query.data.exclude_collection,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.questions.search')
  }
})

quizRouter.patch('/questions/:id', async (req, res) => {
  const params = questionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid question id.')
    return
  }

  const payload = quizQuestionSchema.safeParse(req.body)
  if (!payload.success) {
    sendValidationError(res, payload.error, 'Invalid quiz question payload.')
    return
  }

  try {
    const result = await updateQuizQuestion({
      accessToken: req.accessToken,
      userId: req.userId,
      questionId: params.data.id,
      question: payload.data.question,
      mcqQuestion: payload.data.mcq_question,
      completeAnswer: payload.data.complete_answer,
      mcqOptions: payload.data.mcq_options,
      subject: payload.data.subject,
      difficulty: payload.data.difficulty,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.questions.update')
  }
})

quizRouter.delete('/questions/:id', async (req, res) => {
  const params = questionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    sendValidationError(res, params.error, 'Invalid question id.')
    return
  }

  try {
    const result = await deleteQuizQuestion({
      accessToken: req.accessToken,
      userId: req.userId,
      questionId: params.data.id,
    })
    res.json(result)
  } catch (error) {
    sendQuizCollectionError(res, error, 'quiz.questions.delete')
  }
})

app.use('/api/quiz', quizRouter)

app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      threadId,
      model: requestedModel,
      thinkingEffort,
    } = chatRequestSchema.parse(req.body)
    const model = resolveRequestModel(requestedModel)
    const response = await sendMessage({ message, threadId, model, thinkingEffort })
    res.json(response)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error.'
    res.status(400).json({ error: message })
  }
})

app.post('/api/chat/stream', async (req, res) => {
  let headersSent = false
  const abortController = new AbortController()

  res.on('close', () => abortController.abort())

  try {
    const {
      message,
      threadId,
      model: requestedModel,
      thinkingEffort,
      systemContext,
    } = streamRequestSchema.parse(req.body)
    const model = resolveRequestModel(requestedModel)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    headersSent = true

    await streamMessage({
      message,
      threadId,
      model,
      thinkingEffort,
      systemContext,
      res,
      signal: abortController.signal,
    })
  } catch (error) {
    if (abortController.signal.aborted) {
      if (!res.writableEnded) res.end()
      return
    }

    const message =
      error instanceof Error ? error.message : 'Unknown server error.'

    if (headersSent) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
        res.end()
      }
    } else {
      res.status(400).json({ error: message })
    }
  }
})

app.post('/api/chat/resume', async (req, res) => {
  let headersSent = false
  const abortController = new AbortController()

  res.on('close', () => abortController.abort())

  try {
    const { threadId, action, reason } = resumeSchema.parse(req.body)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    headersSent = true

    await resumeStream({ threadId, action, reason, res, signal: abortController.signal })
  } catch (error) {
    if (abortController.signal.aborted) {
      if (!res.writableEnded) res.end()
      return
    }

    const message =
      error instanceof Error ? error.message : 'Unknown server error.'

    if (headersSent) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
        res.end()
      }
    } else {
      res.status(400).json({ error: message })
    }
  }
})

app.listen(port, () => {
  console.log(`LangChain API server running on http://localhost:${port}`)
})

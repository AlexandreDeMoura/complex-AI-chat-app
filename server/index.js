import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { z } from 'zod'
import { sendMessage, streamMessage, resumeStream } from './application/chat-service.js'
import {
  QuizBulkPersistenceError,
  QuizFeedbackError,
  generateQuizFeedback,
  persistQuizQuestionsBulk,
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

const quizBulkQuestionsSchema = z
  .object({
    questions: z.array(quizQuestionSchema).min(1, 'At least one quiz question is required.'),
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
    })

    res.status(201).json(result)
  } catch (error) {
    if (error instanceof QuizBulkPersistenceError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }

    const message =
      error instanceof Error ? error.message : 'Unknown server error.'
    res.status(500).json({ error: message })
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

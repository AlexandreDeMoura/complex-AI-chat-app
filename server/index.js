import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { z } from 'zod'
import { sendMessage, streamMessage, resumeStream } from './application/chat-service.js'
import { listThreads } from './application/thread-service.js'

const app = express()
const port = Number(process.env.PORT ?? 8788)

const requestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.'),
  threadId: z.string().trim().min(1, 'threadId is required.'),
})

const resumeSchema = z.object({
  threadId: z.string().trim().min(1, 'threadId is required.'),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
})

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

app.post('/api/chat', async (req, res) => {
  try {
    const { message, threadId } = requestSchema.parse(req.body)
    const response = await sendMessage({ message, threadId })
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
    const { message, threadId } = requestSchema.parse(req.body)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    headersSent = true

    await streamMessage({ message, threadId, res, signal: abortController.signal })
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

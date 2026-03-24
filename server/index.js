import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { tool } from '@langchain/core/tools'
import { MemorySaver } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { createAgent } from 'langchain'
import { z } from 'zod'

const app = express()
const port = Number(process.env.PORT ?? 8788)

const getCurrentTime = tool(
  async ({ timezone }) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: timezone,
    }).format(new Date())
  },
  {
    name: 'get_current_time',
    description:
      'Get the current date and time in a given IANA timezone, such as Europe/Paris or America/New_York.',
    schema: z.object({
      timezone: z.string().describe('IANA timezone string'),
    }),
  },
)

const model = new ChatOpenAI({
  model: process.env.LLM_MODEL ?? 'gpt-4.1-mini',
  temperature: 0.65,
  apiKey: process.env.OPENAI_API_KEY,
})

const agent = createAgent({
  model,
  tools: [getCurrentTime],
  checkpointer: new MemorySaver(),
  systemPrompt:
    'You are a concise, warm assistant for a stylish chat app. Be direct, accurate, and practical.',
})

const requestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.'),
  threadId: z.string().trim().min(1, 'threadId is required.'),
})

const extractMessageText = (content) => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part && typeof part === 'object' && 'text' in part) {
          return String(part.text)
        }
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/chat', async (req, res) => {
  try {
    const { message, threadId } = requestSchema.parse(req.body)

    const result = await agent.invoke(
      {
        messages: [{ role: 'user', content: message }],
      },
      {
        configurable: { thread_id: threadId },
        recursionLimit: 10,
      },
    )

    const lastMessage = result.messages[result.messages.length - 1]
    const reply = extractMessageText(lastMessage?.content)

    if (!reply) {
      throw new Error('Model returned an empty response.')
    }

    res.json({ reply })
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

    const stream = await agent.stream(
      { messages: [{ role: 'user', content: message }] },
      {
        configurable: { thread_id: threadId },
        streamMode: 'messages',
        recursionLimit: 10,
        signal: abortController.signal,
      },
    )

    for await (const [chunk] of stream) {
      if (res.writableEnded) break

      const isAIChunk = chunk._getType?.() === 'ai'
      const content = extractMessageText(chunk.content)

      if (isAIChunk && content) {
        res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`)
      }
    }

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      res.end()
    }
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

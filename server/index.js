import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { tool } from '@langchain/core/tools'
import { interrupt, Command } from '@langchain/langgraph'
import { MemorySaver } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { createAgent } from 'langchain'
import { z } from 'zod'

const app = express()
const port = Number(process.env.PORT ?? 8788)

const getCurrentTime = tool(
  async ({ timezone }) => {
    // WHY: interrupt() pauses the graph so the user can approve/reject the tool call.
    // The resume value from Command({ resume }) is returned here.
    const approval = interrupt({
      tool: 'get_current_time',
      description: `Get the current date and time in ${timezone}`,
      args: { timezone },
    })

    if (approval?.action === 'reject') {
      return `Tool call rejected by user. Reason: ${approval.reason || 'No reason provided.'}`
    }

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

const llmModel = process.env.LLM_MODEL ?? 'gpt-4.1-mini'

// WHY: provider is inferred from the model name so callers only set LLM_MODEL
const model = llmModel.startsWith('claude-')
  ? new ChatAnthropic({ model: llmModel, temperature: 0.65, apiKey: process.env.ANTHROPIC_API_KEY })
  : new ChatOpenAI({ model: llmModel, temperature: 0.65, apiKey: process.env.OPENAI_API_KEY })

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

const resumeSchema = z.object({
  threadId: z.string().trim().min(1, 'threadId is required.'),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
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

// Shared helper: stream agent output as SSE events and detect interrupts.
async function streamAgentToSSE(stream, res, threadId) {
  for await (const [chunk] of stream) {
    if (res.writableEnded) break

    const chunkType = chunk._getType?.()
    const content = extractMessageText(chunk.content)

    if (chunkType === 'ai' && content) {
      res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`)
    }

    if (chunkType === 'tool' && content) {
      res.write(
        `data: ${JSON.stringify({
          type: 'tool_result',
          toolCallId: chunk.tool_call_id,
          name: chunk.name,
          content,
        })}\n\n`,
      )
    }
  }

  // After the stream loop, check for interrupts via graph state
  const config = { configurable: { thread_id: threadId } }
  const state = await agent.graph.getState(config)

  if (state.next && state.next.length > 0) {
    // Graph is paused at an interrupt — extract pending tool calls from the last AI message
    const msgs = state.values.messages ?? []
    const lastAI = [...msgs].reverse().find((m) => m._getType?.() === 'ai')
    const toolCalls = (lastAI?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args,
    }))

    if (toolCalls.length > 0) {
      res.write(
        `data: ${JSON.stringify({ type: 'interrupt', toolCalls })}\n\n`,
      )
    }
  }
}

app.use(cors())
app.use(express.json())

// In-memory thread metadata store — keyed by thread_id
const threads = new Map()

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/threads', (_req, res) => {
  const list = Array.from(threads.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )
  res.json(list)
})

app.post('/api/chat', async (req, res) => {
  try {
    const { message, threadId } = requestSchema.parse(req.body)

    // Track thread metadata
    const now = new Date().toISOString()
    if (!threads.has(threadId)) {
      threads.set(threadId, {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        first_message_preview: message.slice(0, 100),
      })
    } else {
      threads.get(threadId).updated_at = now
    }

    // Auto-approve loop: invoke until the graph completes (no pending interrupts)
    const config = { configurable: { thread_id: threadId }, recursionLimit: 10 }
    let result = await agent.invoke(
      { messages: [{ role: 'user', content: message }] },
      config,
    )

    let state = await agent.graph.getState(config)
    while (state.next && state.next.length > 0) {
      result = await agent.invoke(
        new Command({ resume: { action: 'approve' } }),
        config,
      )
      state = await agent.graph.getState(config)
    }

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

    // Track thread metadata
    const now = new Date().toISOString()
    if (!threads.has(threadId)) {
      threads.set(threadId, {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        first_message_preview: message.slice(0, 100),
      })
    } else {
      threads.get(threadId).updated_at = now
    }

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

    await streamAgentToSSE(stream, res, threadId)

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

    const resumeValue =
      action === 'approve'
        ? { action: 'approve' }
        : { action: 'reject', reason: reason || '' }

    const stream = await agent.stream(
      new Command({ resume: resumeValue }),
      {
        configurable: { thread_id: threadId },
        streamMode: 'messages',
        recursionLimit: 10,
        signal: abortController.signal,
      },
    )

    await streamAgentToSSE(stream, res, threadId)

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

import { Command } from '@langchain/langgraph'
import { extractMessageText } from '../domain/message-utils.js'
import { getAgent } from '../infrastructure/agent.js'
import { threadStore } from '../infrastructure/thread-store.js'

const RECURSION_LIMIT = 10

const getThreadConfig = (threadId) => ({
  configurable: { thread_id: threadId },
})

const writeSseEvent = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

// WHY: interrupt state is only visible through graph state after stream completion.
const emitInterruptIfPending = async (agent, threadId, res) => {
  const state = await agent.graph.getState(getThreadConfig(threadId))
  if (!state.next || state.next.length === 0) {
    return
  }

  const messages = state.values.messages ?? []
  const lastAI = [...messages].reverse().find((message) => message._getType?.() === 'ai')
  const toolCalls = (lastAI?.tool_calls ?? []).map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args,
  }))

  if (toolCalls.length > 0) {
    writeSseEvent(res, { type: 'interrupt', toolCalls })
  }
}

const streamAgentToSSE = async (stream, res, threadId, agent) => {
  for await (const [chunk] of stream) {
    if (res.writableEnded) {
      break
    }

    const chunkType = chunk._getType?.()
    const content = extractMessageText(chunk.content)

    if (chunkType === 'ai' && content) {
      writeSseEvent(res, { type: 'token', content })
    }

    if (chunkType === 'tool' && content) {
      writeSseEvent(res, {
        type: 'tool_result',
        toolCallId: chunk.tool_call_id,
        name: chunk.name,
        content,
      })
    }
  }

  await emitInterruptIfPending(agent, threadId, res)
}

export const sendMessage = async ({ message, threadId, model }) => {
  const agent = getAgent(model)
  threadStore.upsert(threadId, message, model)

  const config = { ...getThreadConfig(threadId), recursionLimit: RECURSION_LIMIT }
  let result = await agent.invoke(
    { messages: [{ role: 'user', content: message }] },
    config,
  )

  let state = await agent.graph.getState(getThreadConfig(threadId))
  while (state.next && state.next.length > 0) {
    result = await agent.invoke(
      new Command({ resume: { action: 'approve' } }),
      config,
    )
    state = await agent.graph.getState(getThreadConfig(threadId))
  }

  const lastMessage = result.messages[result.messages.length - 1]
  const reply = extractMessageText(lastMessage?.content)

  if (!reply) {
    throw new Error('Model returned an empty response.')
  }

  return { reply }
}

export const streamMessage = async ({ message, threadId, model, res, signal }) => {
  const agent = getAgent(model)
  threadStore.upsert(threadId, message, model)

  const stream = await agent.stream(
    { messages: [{ role: 'user', content: message }] },
    {
      ...getThreadConfig(threadId),
      streamMode: 'messages',
      recursionLimit: RECURSION_LIMIT,
      signal,
    },
  )

  await streamAgentToSSE(stream, res, threadId, agent)

  if (!res.writableEnded) {
    writeSseEvent(res, { type: 'done' })
    res.end()
  }
}

export const resumeStream = async ({ threadId, action, reason, res, signal }) => {
  const thread = threadStore.get(threadId)
  if (!thread) {
    throw new Error(`Thread "${threadId}" not found.`)
  }

  if (!thread.model) {
    throw new Error(`Thread "${threadId}" has no model configured.`)
  }

  const agent = getAgent(thread.model)
  const resumeValue =
    action === 'approve'
      ? { action: 'approve' }
      : { action: 'reject', reason: reason || '' }

  const stream = await agent.stream(
    new Command({ resume: resumeValue }),
    {
      ...getThreadConfig(threadId),
      streamMode: 'messages',
      recursionLimit: RECURSION_LIMIT,
      signal,
    },
  )

  await streamAgentToSSE(stream, res, threadId, agent)

  if (!res.writableEnded) {
    writeSseEvent(res, { type: 'done' })
    res.end()
  }
}

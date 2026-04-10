import type { ToolCallData } from '@/features/chat/model'

type StreamEventRecord = Record<string, unknown>

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | {
    type: 'tool_result'
    toolCallId: string
    name: string
    content: string
  }
  | { type: 'interrupt'; toolCalls: ToolCallData[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface ReadChatStreamOptions {
  response: Response
  signal: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

function isObject(value: unknown): value is StreamEventRecord {
  return typeof value === 'object' && value !== null
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toToolCalls(value: unknown): ToolCallData[] {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is ToolCallData => {
    if (!isObject(item)) return false

    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      isObject(item.args)
    )
  })
}

function parseEvent(rawEvent: unknown): ChatStreamEvent | null {
  if (!isObject(rawEvent) || typeof rawEvent.type !== 'string') {
    return null
  }

  if (rawEvent.type === 'token') {
    const content = toString(rawEvent.content)
    if (!content) return null

    return {
      type: 'token',
      content,
    }
  }

  if (rawEvent.type === 'tool_result') {
    return {
      type: 'tool_result',
      toolCallId: toString(rawEvent.toolCallId),
      name: toString(rawEvent.name),
      content: toString(rawEvent.content),
    }
  }

  if (rawEvent.type === 'interrupt') {
    const toolCalls = toToolCalls(rawEvent.toolCalls)

    return {
      type: 'interrupt',
      toolCalls,
    }
  }

  if (rawEvent.type === 'error') {
    return {
      type: 'error',
      message: toString(rawEvent.message) || 'Stream error',
    }
  }

  if (rawEvent.type === 'done') {
    return { type: 'done' }
  }

  return null
}

async function ensureReadableSSE(response: Response): Promise<void> {
  if (response.ok && response.body) {
    return
  }

  const err = await response.json().catch(() => null)
  const message =
    isObject(err) && typeof err.error === 'string'
      ? err.error
      : `Server error (${response.status})`

  throw new Error(message)
}

export async function readChatStream({
  response,
  signal,
  onEvent,
}: ReadChatStreamOptions): Promise<void> {
  await ensureReadableSSE(response)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal.aborted) break
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data: ')) continue

      const payload = line.slice(6)
      let parsed: unknown
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }

      const event = parseEvent(parsed)
      if (!event) continue
      onEvent(event)
    }
  }
}

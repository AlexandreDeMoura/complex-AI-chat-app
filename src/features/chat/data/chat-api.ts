import type {
  ModelOption,
  ThinkingEffort,
  ThreadSummary,
} from '@/features/chat/model'

interface ChatStreamRequest {
  message: string
  threadId: string
  model?: string
  thinkingEffort?: ThinkingEffort
  systemContext?: string
  signal: AbortSignal
}

interface ChatResumeRequest {
  threadId: string
  action: 'approve' | 'reject'
  reason?: string
  signal: AbortSignal
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function checkChatHealth(): Promise<void> {
  const response = await fetch('/api/health')

  if (!response.ok) {
    throw new Error(`Status ${response.status}`)
  }
}

export async function fetchThreadHistory(): Promise<ThreadSummary[]> {
  const response = await fetch('/api/threads')

  if (!response.ok) {
    throw new Error(`Status ${response.status}`)
  }

  return response.json() as Promise<ThreadSummary[]>
}

export async function fetchAvailableModels(): Promise<ModelOption[]> {
  const response = await fetch('/api/models')

  if (!response.ok) {
    throw new Error(`Status ${response.status}`)
  }

  return response.json() as Promise<ModelOption[]>
}

export function openChatStream({
  message,
  threadId,
  model,
  thinkingEffort,
  systemContext,
  signal,
}: ChatStreamRequest): Promise<Response> {
  return fetch('/api/chat/stream', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ message, threadId, model, thinkingEffort, systemContext }),
    signal,
  })
}

export function openResumeStream({
  threadId,
  action,
  reason,
  signal,
}: ChatResumeRequest): Promise<Response> {
  return fetch('/api/chat/resume', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ threadId, action, reason }),
    signal,
  })
}

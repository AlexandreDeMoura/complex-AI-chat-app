export interface ToolCallData {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResultData {
  toolCallId: string
  name: string
  content: string
}

export interface InterruptState {
  toolCalls: ToolCallData[]
}

export interface ChatMessage {
  id: string
  role: 'human' | 'assistant'
  content: string
  toolCalls?: ToolCallData[]
  toolResults?: ToolResultData[]
}

export interface ThreadSummary {
  thread_id: string
  model?: string
  created_at: string
  updated_at: string
  first_message_preview: string
}

export const THINKING_EFFORTS = ['off', 'low', 'medium', 'high', 'max'] as const
export type ThinkingEffort = (typeof THINKING_EFFORTS)[number]

export interface ModelOption {
  id: string
  name: string
  provider: string
  supportsThinking: boolean
}

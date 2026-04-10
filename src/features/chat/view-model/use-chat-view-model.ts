import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  checkChatHealth,
  openChatStream,
  openResumeStream,
  readChatStream,
} from '@/features/chat/data'
import type {
  ChatMessage,
  InterruptState,
  ToolResultData,
} from '@/features/chat/model'

type ResumeAction = 'approve' | 'reject'

interface RunAssistantStreamOptions {
  assistantMessageId: string
  openStream: (signal: AbortSignal) => Promise<Response>
  onCompleted?: () => void
}

export interface ChatViewModel {
  currentThreadId: string
  messages: ChatMessage[]
  isLoading: boolean
  interrupt: InterruptState | null
  refreshKey: number
  sendMessage: (text: string) => Promise<void>
  stopGeneration: () => void
  resumeInterrupt: (action: ResumeAction, reason?: string) => Promise<void>
  regenerateMessage: (assistantMessageId: string) => void
  startNewThread: () => void
  selectThread: (threadId: string) => void
}

function findHumanMessageBeforeAssistant(
  messages: ChatMessage[],
  assistantMessageId: string,
): string {
  const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId)
  if (assistantIndex < 0) return ''

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'human') {
      return messages[index].content
    }
  }

  return ''
}

export function useChatViewModel(): ChatViewModel {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [interrupt, setInterrupt] = useState<InterruptState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const threadIdRef = useRef<string>(crypto.randomUUID())
  const abortControllerRef = useRef<AbortController | null>(null)
  const nextMessageIdRef = useRef(1)

  const createMessageId = useCallback(() => {
    const nextMessageId = nextMessageIdRef.current
    nextMessageIdRef.current += 1
    return String(nextMessageId)
  }, [])

  useEffect(() => {
    checkChatHealth().catch(() => {
      toast.error('Unable to reach the backend server', {
        description: 'Make sure the server is running with: node server/index.js',
        duration: 10000,
      })
    })
  }, [])

  useEffect(
    () => () => {
      abortControllerRef.current?.abort()
    },
    [],
  )

  const readSSEStream = useCallback(
    async (
      response: Response,
      assistantMessageId: string,
      signal: AbortSignal,
    ): Promise<InterruptState | null> => {
      let receivedInterrupt: InterruptState | null = null

      await readChatStream({
        response,
        signal,
        onEvent: (event) => {
          if (event.type === 'token') {
            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + event.content }
                  : message,
              ),
            )
            return
          }

          if (event.type === 'tool_result') {
            const result: ToolResultData = {
              toolCallId: event.toolCallId,
              name: event.name,
              content: event.content,
            }

            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                    ...message,
                    toolResults: [...(message.toolResults ?? []), result],
                  }
                  : message,
              ),
            )
            return
          }

          if (event.type === 'interrupt') {
            receivedInterrupt = { toolCalls: event.toolCalls }
            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, toolCalls: event.toolCalls }
                  : message,
              ),
            )
            return
          }

          if (event.type === 'error') {
            throw new Error(event.message || 'Stream error')
          }
        },
      })

      return receivedInterrupt
    },
    [],
  )

  const handleStreamError = useCallback((error: unknown, assistantMessageId: string) => {
    if ((error as Error).name === 'AbortError') {
      setMessages((previousMessages) =>
        previousMessages.filter(
          (message) => !(message.id === assistantMessageId && !message.content),
        ),
      )
      return
    }

    toast.error('An error occurred. Please try again.', {
      description: (error as Error).message,
      duration: 10000,
    })

    setMessages((previousMessages) =>
      previousMessages.filter((message) => message.id !== assistantMessageId),
    )
  }, [])

  const runAssistantStream = useCallback(
    async ({
      assistantMessageId,
      openStream,
      onCompleted,
    }: RunAssistantStreamOptions): Promise<void> => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await openStream(controller.signal)
        const interruptData = await readSSEStream(
          response,
          assistantMessageId,
          controller.signal,
        )

        if (interruptData) {
          setInterrupt(interruptData)
        }

        onCompleted?.()
      } catch (error) {
        handleStreamError(error, assistantMessageId)
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        setIsLoading(false)
      }
    },
    [handleStreamError, readSSEStream],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText || isLoading) return

      const humanMessage: ChatMessage = {
        id: createMessageId(),
        role: 'human',
        content: trimmedText,
      }
      const assistantMessageId = createMessageId()

      setMessages((previousMessages) => [
        ...previousMessages,
        humanMessage,
        { id: assistantMessageId, role: 'assistant', content: '' },
      ])
      setIsLoading(true)
      setInterrupt(null)

      await runAssistantStream({
        assistantMessageId,
        openStream: (signal) =>
          openChatStream({
            message: trimmedText,
            threadId: threadIdRef.current,
            signal,
          }),
        onCompleted: () => setRefreshKey((key) => key + 1),
      })
    },
    [createMessageId, isLoading, runAssistantStream],
  )

  const resumeInterrupt = useCallback(
    async (action: ResumeAction, reason?: string) => {
      setIsLoading(true)
      setInterrupt(null)

      const assistantMessageId = createMessageId()
      setMessages((previousMessages) => [
        ...previousMessages,
        { id: assistantMessageId, role: 'assistant', content: '' },
      ])

      await runAssistantStream({
        assistantMessageId,
        openStream: (signal) =>
          openResumeStream({
            threadId: threadIdRef.current,
            action,
            reason,
            signal,
          }),
        onCompleted: () => setRefreshKey((key) => key + 1),
      })
    },
    [createMessageId, runAssistantStream],
  )

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const regenerateMessage = useCallback(
    (assistantMessageId: string) => {
      if (isLoading) return

      const humanMessageContent = findHumanMessageBeforeAssistant(messages, assistantMessageId)
      if (!humanMessageContent) return

      const replacementAssistantMessageId = createMessageId()

      setMessages((previousMessages) =>
        previousMessages.map((message) =>
          message.id === assistantMessageId
            ? { id: replacementAssistantMessageId, role: 'assistant', content: '' }
            : message,
        ),
      )
      setIsLoading(true)
      setInterrupt(null)

      void runAssistantStream({
        assistantMessageId: replacementAssistantMessageId,
        openStream: (signal) =>
          openChatStream({
            message: humanMessageContent,
            threadId: threadIdRef.current,
            signal,
          }),
      })
    },
    [createMessageId, isLoading, messages, runAssistantStream],
  )

  const startNewThread = useCallback(() => {
    abortControllerRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    setInterrupt(null)
    threadIdRef.current = crypto.randomUUID()
  }, [])

  const selectThread = useCallback((threadId: string) => {
    if (threadId === threadIdRef.current) return

    abortControllerRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    setInterrupt(null)
    threadIdRef.current = threadId
  }, [])

  return {
    currentThreadId: threadIdRef.current,
    messages,
    isLoading,
    interrupt,
    refreshKey,
    sendMessage,
    stopGeneration,
    resumeInterrupt,
    regenerateMessage,
    startNewThread,
    selectThread,
  }
}

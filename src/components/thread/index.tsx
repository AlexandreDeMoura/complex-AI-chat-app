import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Moon,
  PanelRightClose,
  Square,
  SquarePen,
  Sun,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { TooltipIconButton } from '@/components/thread/tooltip-icon-button'
import { cn } from '@/lib/utils'
import { HumanMessage } from '@/components/thread/messages/human'
import {
  AssistantMessage,
  AssistantMessageLoading,
} from '@/components/thread/messages/ai'
import { ThreadHistory } from '@/components/thread/history'
import { InterruptView, type InterruptState } from '@/components/thread/interrupt-view'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useDarkMode } from '@/hooks/use-dark-mode'
import type { ToolCallData, ToolResultData } from '@/components/thread/messages/tool-calls'

export interface ChatMessage {
  id: string
  role: 'human' | 'assistant'
  content: string
  toolCalls?: ToolCallData[]
  toolResults?: ToolResultData[]
}

let nextId = 1

const SIDEBAR_WIDTH = 300
const springTransition = { type: 'spring', stiffness: 300, damping: 30 } as const

export function Thread() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [interrupt, setInterrupt] = useState<InterruptState | null>(null)
  const [hideToolCalls, setHideToolCalls] = useState(false)
  const threadIdRef = useRef(crypto.randomUUID())
  const abortControllerRef = useRef<AbortController | null>(null)

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hasMessages = messages.length > 0
  const { isDark, toggleDarkMode } = useDarkMode()

  // Connection check on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`)
      })
      .catch(() => {
        toast.error('Unable to reach the backend server', {
          description: 'Make sure the server is running with: node server/index.js',
          duration: 10000,
        })
      })
  }, [])

  // Shared SSE reader — parses events and updates the assistant message.
  // Returns the interrupt data if one is received.
  const readSSEStream = useCallback(
    async (
      response: Response,
      assistantMsgId: string,
      signal: AbortSignal,
    ): Promise<InterruptState | null> => {
      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error ?? `Server error (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedInterrupt: InterruptState | null = null

      while (true) {
        if (signal.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()!

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue

          let event: Record<string, unknown>
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }

          if (event.type === 'token' && event.content) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: msg.content + (event.content as string) }
                  : msg,
              ),
            )
          } else if (event.type === 'tool_result') {
            const result: ToolResultData = {
              toolCallId: event.toolCallId as string,
              name: event.name as string,
              content: event.content as string,
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, toolResults: [...(msg.toolResults ?? []), result] }
                  : msg,
              ),
            )
          } else if (event.type === 'interrupt') {
            const toolCalls = event.toolCalls as ToolCallData[]
            receivedInterrupt = { toolCalls }
            // Store the tool calls on the assistant message so the UI can display them
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, toolCalls } : msg,
              ),
            )
          } else if (event.type === 'error') {
            throw new Error((event.message as string) ?? 'Stream error')
          }
        }
      }

      return receivedInterrupt
    },
    [],
  )

  const handleStreamError = useCallback(
    (error: unknown, assistantMsgId: string) => {
      if ((error as Error).name === 'AbortError') {
        setMessages((prev) =>
          prev.filter(
            (msg) => !(msg.id === assistantMsgId && !msg.content),
          ),
        )
      } else {
        toast.error('An error occurred. Please try again.', {
          description: (error as Error).message,
          duration: 10000,
        })
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMsgId),
        )
      }
    },
    [],
  )

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const humanMsg: ChatMessage = {
        id: String(nextId++),
        role: 'human',
        content: trimmed,
      }
      const assistantMsgId = String(nextId++)

      setMessages((prev) => [
        ...prev,
        humanMsg,
        { id: assistantMsgId, role: 'assistant' as const, content: '' },
      ])
      setInput('')
      setIsLoading(true)
      setInterrupt(null)

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            threadId: threadIdRef.current,
          }),
          signal: controller.signal,
        })

        const interruptData = await readSSEStream(
          response,
          assistantMsgId,
          controller.signal,
        )

        if (interruptData) {
          setInterrupt(interruptData)
        }

        setRefreshKey((k) => k + 1)
      } catch (error) {
        handleStreamError(error, assistantMsgId)
      } finally {
        abortControllerRef.current = null
        setIsLoading(false)
      }
    },
    [isLoading, readSSEStream, handleStreamError],
  )

  const handleResume = useCallback(
    async (action: 'approve' | 'reject', reason?: string) => {
      setIsLoading(true)
      setInterrupt(null)

      // Create a new assistant message for the post-resume response
      const assistantMsgId = String(nextId++)
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant' as const, content: '' },
      ])

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await fetch('/api/chat/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: threadIdRef.current,
            action,
            reason,
          }),
          signal: controller.signal,
        })

        const interruptData = await readSSEStream(
          response,
          assistantMsgId,
          controller.signal,
        )

        if (interruptData) {
          setInterrupt(interruptData)
        }

        setRefreshKey((k) => k + 1)
      } catch (error) {
        handleStreamError(error, assistantMsgId)
      } finally {
        abortControllerRef.current = null
        setIsLoading(false)
      }
    },
    [readSSEStream, handleStreamError],
  )

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleRegenerate = useCallback(
    (assistantMsgId: string) => {
      if (isLoading) return

      const msgs = messages
      const aiIdx = msgs.findIndex((m) => m.id === assistantMsgId)
      if (aiIdx < 0) return

      let humanContent = ''
      for (let i = aiIdx - 1; i >= 0; i--) {
        if (msgs[i].role === 'human') {
          humanContent = msgs[i].content
          break
        }
      }
      if (!humanContent) return

      const newAssistantId = String(nextId++)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { id: newAssistantId, role: 'assistant' as const, content: '' }
            : m,
        ),
      )
      setIsLoading(true)
      setInterrupt(null)

      const controller = new AbortController()
      abortControllerRef.current = controller

      ;(async () => {
        try {
          const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: humanContent,
              threadId: threadIdRef.current,
            }),
            signal: controller.signal,
          })

          const interruptData = await readSSEStream(
            response,
            newAssistantId,
            controller.signal,
          )

          if (interruptData) {
            setInterrupt(interruptData)
          }
        } catch (error) {
          handleStreamError(error, newAssistantId)
        } finally {
          abortControllerRef.current = null
          setIsLoading(false)
        }
      })()
    },
    [isLoading, messages, readSSEStream, handleStreamError],
  )

  const handleNewThread = useCallback(() => {
    abortControllerRef.current?.abort()
    setMessages([])
    setInput('')
    setIsLoading(false)
    setInterrupt(null)
    threadIdRef.current = crypto.randomUUID()
  }, [])

  const handleSelectThread = useCallback(
    (threadId: string) => {
      if (threadId === threadIdRef.current) return
      abortControllerRef.current?.abort()
      setMessages([])
      setInput('')
      setIsLoading(false)
      setInterrupt(null)
      threadIdRef.current = threadId as ReturnType<typeof crypto.randomUUID>
      if (!isDesktop) setSidebarOpen(false)
    },
    [isDesktop],
  )

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const sidebarContent = (
    <ThreadHistory
      currentThreadId={threadIdRef.current}
      onSelectThread={handleSelectThread}
      onNewThread={handleNewThread}
      refreshKey={refreshKey}
    />
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      {isDesktop && (
        <motion.div
          className="h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar"
          style={{ width: SIDEBAR_WIDTH }}
          animate={{ marginLeft: sidebarOpen ? 0 : -SIDEBAR_WIDTH }}
          initial={{ marginLeft: -SIDEBAR_WIDTH }}
          transition={springTransition}
        >
          {sidebarContent}
        </motion.div>
      )}

      {/* Mobile sidebar */}
      {!isDesktop && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[300px] p-0">
            <SheetTitle className="sr-only">Chat History</SheetTitle>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {/* Main content area */}
      <motion.div
        className="min-w-0 flex-1"
        layout
        transition={springTransition}
      >
        {/* Header */}
        <div className="relative z-10">
          <header className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <TooltipIconButton
                tooltip="Toggle sidebar"
                className="size-8 p-1.5"
                onClick={toggleSidebar}
              >
                <PanelRightClose className="size-5" />
              </TooltipIconButton>

              {hasMessages && (
                <motion.div
                  className="flex items-center gap-2"
                  animate={{
                    marginLeft: !sidebarOpen && isDesktop ? 8 : 0,
                  }}
                  transition={springTransition}
                >
                  <ChatLogo className="ml-1" />
                  <span className="text-xl font-semibold tracking-tight">
                    Agent Chat
                  </span>
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <TooltipIconButton
                tooltip={isDark ? 'Light mode' : 'Dark mode'}
                className="size-8 p-1.5"
                onClick={toggleDarkMode}
              >
                {isDark ? (
                  <Sun className="size-5" />
                ) : (
                  <Moon className="size-5" />
                )}
              </TooltipIconButton>

              {hasMessages && (
                <TooltipIconButton
                  tooltip="New thread"
                  className="size-8 p-1.5"
                  onClick={handleNewThread}
                >
                  <SquarePen className="size-5" />
                </TooltipIconButton>
              )}
            </div>
          </header>

          {/* Gradient fade under header */}
          <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
        </div>

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {!hasMessages ? (
            /* Empty state */
            <div className="flex-1 overflow-y-auto">
              <div className="mt-[25vh] flex w-full flex-col items-center px-4">
                <ChatLogo className="mb-4 h-10 w-10" />
                <h1 className="text-xl font-semibold tracking-tight">Agent Chat</h1>
                <p className="mb-8 text-sm text-muted-foreground">Ask me anything.</p>
                <Composer
                  input={input}
                  setInput={setInput}
                  onSend={handleSend}
                  onStop={handleStop}
                  isLoading={isLoading}
                  hideToolCalls={hideToolCalls}
                  onToggleHideToolCalls={() => setHideToolCalls((p) => !p)}
                />
              </div>
            </div>
          ) : (
            /* Chat state */
            <StickToBottom
              className="relative flex-1 overflow-hidden"
              resize="smooth"
              initial="smooth"
            >
              <StickToBottom.Content
                scrollClassName={cn(
                  '[&::-webkit-scrollbar]:w-1.5',
                  '[&::-webkit-scrollbar-thumb]:rounded-full',
                  '[&::-webkit-scrollbar-thumb]:bg-gray-300',
                  'dark:[&::-webkit-scrollbar-thumb]:bg-gray-600',
                  '[&::-webkit-scrollbar-track]:bg-transparent',
                )}
              >
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-8 pb-16">
                  {messages.map((msg) =>
                    msg.role === 'human' ? (
                      <HumanMessage key={msg.id} content={msg.content} />
                    ) : msg.content || msg.toolCalls?.length ? (
                      <AssistantMessage
                        key={msg.id}
                        content={msg.content}
                        onRegenerate={() => handleRegenerate(msg.id)}
                        toolCalls={msg.toolCalls}
                        toolResults={msg.toolResults}
                        hideToolCalls={hideToolCalls}
                      />
                    ) : (
                      <AssistantMessageLoading key={msg.id} />
                    ),
                  )}

                  {interrupt && (
                    <InterruptView
                      interrupt={interrupt}
                      onApprove={() => handleResume('approve')}
                      onReject={(reason) => handleResume('reject', reason)}
                      isLoading={isLoading}
                    />
                  )}
                </div>
              </StickToBottom.Content>

              <ScrollToBottomButton />
            </StickToBottom>
          )}

          {/* Bottom-pinned composer */}
          {hasMessages && (
            <div className="px-4">
              <Composer
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onStop={handleStop}
                isLoading={isLoading}
                hideToolCalls={hideToolCalls}
                onToggleHideToolCalls={() => setHideToolCalls((p) => !p)}
              />
            </div>
          )}
        </main>
      </motion.div>
    </div>
  )
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  if (isAtBottom) return null

  return (
    <button
      type="button"
      className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2 rounded-full border border-border bg-background p-2 shadow-md transition-colors hover:bg-muted"
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="size-4 text-foreground" />
    </button>
  )
}

function Composer({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  hideToolCalls,
  onToggleHideToolCalls,
}: {
  input: string
  setInput: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  isLoading: boolean
  hideToolCalls: boolean
  onToggleHideToolCalls: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return
    onSend(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className={cn(
        'bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs transition-all',
        isDragOver && 'border-primary border-2 border-dotted',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => setIsDragOver(false)}
    >
      <form
        className="grid grid-rows-[1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <textarea
          ref={textareaRef}
          aria-label="Message input"
          className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:outline-none placeholder:text-muted-foreground/50 dark:placeholder:text-foreground/30"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="flex items-center justify-between p-2 pt-4">
          <div className="flex items-center gap-2">
            <Switch
              id="hide-tool-calls"
              checked={hideToolCalls}
              onCheckedChange={onToggleHideToolCalls}
            />
            <Label
              htmlFor="hide-tool-calls"
              className="text-muted-foreground dark:text-foreground/50 cursor-pointer text-xs"
            >
              Hide Tool Calls
            </Label>
          </div>

          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-lg shadow-md transition-all"
              onClick={onStop}
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="rounded-lg shadow-md transition-all"
              disabled={!input.trim()}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function ChatLogo({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-6 w-6 text-foreground', className)}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="14" cy="14" r="5" fill="currentColor" />
      <circle cx="34" cy="14" r="5" fill="currentColor" />
      <circle cx="24" cy="34" r="5" fill="currentColor" />
      <line x1="14" y1="14" x2="34" y2="14" stroke="currentColor" strokeWidth="3" />
      <line x1="14" y1="14" x2="24" y2="34" stroke="currentColor" strokeWidth="3" />
      <line x1="34" y1="14" x2="24" y2="34" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

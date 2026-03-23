import { useCallback, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, PanelRightClose, SquarePen } from 'lucide-react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import { Button } from '@/components/ui/button'
import { TooltipIconButton } from '@/components/thread/tooltip-icon-button'
import { cn } from '@/lib/utils'
import { HumanMessage } from '@/components/thread/messages/human'
import {
  AssistantMessage,
  AssistantMessageLoading,
} from '@/components/thread/messages/ai'

export interface ChatMessage {
  id: string
  role: 'human' | 'assistant'
  content: string
}

const MOCK_RESPONSES = [
  'The capital of France is Paris. It is the largest city in France and serves as the country\'s political, economic, and cultural center.',
  'That\'s a great question! Let me think about it. The answer involves several factors that we should consider carefully.',
  'Here\'s what I know about that topic. There are many interesting aspects to explore, and I\'d be happy to dive deeper into any of them.',
  'I appreciate you asking! This is a fascinating subject with a rich history and many modern developments worth discussing.',
]

let nextId = 1

export function Thread() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const hasMessages = messages.length > 0

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const humanMsg: ChatMessage = {
        id: String(nextId++),
        role: 'human',
        content: trimmed,
      }

      setMessages((prev) => [...prev, humanMsg])
      setInput('')
      setIsLoading(true)

      // WHY: Mock response with delay simulates streaming latency.
      // Will be replaced by real SSE streaming in commit 7.
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: String(nextId++),
          role: 'assistant',
          content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
        }
        setMessages((prev) => [...prev, aiMsg])
        setIsLoading(false)
      }, 1500)
    },
    [isLoading],
  )

  const handleNewThread = useCallback(() => {
    setMessages([])
    setInput('')
    setIsLoading(false)
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="relative z-10">
          <header className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <TooltipIconButton
                tooltip="Toggle sidebar"
                className="size-8 p-1.5"
              >
                <PanelRightClose className="size-5" />
              </TooltipIconButton>

              {hasMessages && (
                <>
                  <ChatLogo className="ml-1" />
                  <span className="text-xl font-semibold tracking-tight">
                    Agent Chat
                  </span>
                </>
              )}
            </div>

            {hasMessages && (
              <TooltipIconButton
                tooltip="New thread"
                className="size-8 p-1.5"
                onClick={handleNewThread}
              >
                <SquarePen className="size-5" />
              </TooltipIconButton>
            )}
          </header>

          {/* Gradient fade under header */}
          <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
        </div>

        {!hasMessages ? (
          /* Empty state — logo + title centered at ~25vh, composer below */
          <div className="flex-1 overflow-y-auto">
            <div className="mt-[25vh] flex w-full flex-col items-center px-4">
              <ChatLogo className="mb-4 h-12 w-12" />
              <h1 className="mb-8 text-2xl font-semibold tracking-tight">
                Agent Chat
              </h1>
              <Composer
                input={input}
                setInput={setInput}
                onSend={handleSend}
                isLoading={isLoading}
              />
            </div>
          </div>
        ) : (
          /* Chat state — stick-to-bottom scroll with messages + composer */
          <StickToBottom
            className={cn(
              'relative flex-1 overflow-y-auto',
              '[&::-webkit-scrollbar]:w-1.5',
              '[&::-webkit-scrollbar-thumb]:rounded-full',
              '[&::-webkit-scrollbar-thumb]:bg-gray-300',
              '[&::-webkit-scrollbar-track]:bg-transparent',
            )}
            resize="smooth"
            initial="smooth"
          >
            <StickToBottom.Content>
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-8 pb-16">
                {messages.map((msg) =>
                  msg.role === 'human' ? (
                    <HumanMessage key={msg.id} content={msg.content} />
                  ) : (
                    <AssistantMessage key={msg.id} content={msg.content} />
                  ),
                )}
                {isLoading && <AssistantMessageLoading />}
              </div>
            </StickToBottom.Content>

            <ScrollToBottomButton />
          </StickToBottom>
        )}

        {/* Bottom-pinned composer (visible only when messages exist) */}
        {hasMessages && (
          <div className="px-4">
            <Composer
              input={input}
              setInput={setInput}
              onSend={handleSend}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
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
  isLoading,
}: {
  input: string
  setInput: (value: string) => void
  onSend: (text: string) => void
  isLoading: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    <div className="bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs">
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
          className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:outline-none"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="flex items-center justify-end p-2 pt-4">
          <Button
            type="submit"
            size="icon"
            className="ml-auto rounded-lg shadow-md transition-all"
            disabled={!input.trim() || isLoading}
          >
            <ArrowUp className="size-4" />
          </Button>
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

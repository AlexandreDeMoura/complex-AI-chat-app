import { useState } from 'react'
import { ArrowUp, PanelRightClose, SquarePen } from 'lucide-react'
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

const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'human',
    content: 'What is the capital of France?',
  },
  {
    id: '2',
    role: 'assistant',
    content:
      'The capital of France is Paris. It is the largest city in France and serves as the country\'s political, economic, and cultural center. Paris is known for landmarks like the Eiffel Tower, the Louvre Museum, and Notre-Dame Cathedral.',
  },
  {
    id: '3',
    role: 'human',
    content: 'Thanks! Can you tell me about\nits population?',
  },
  {
    id: '4',
    role: 'assistant',
    content:
      'The city of Paris has a population of approximately 2.1 million people within the city limits. However, the greater Paris metropolitan area (Île-de-France) is home to around 12 million people, making it one of the most populous urban areas in Europe.',
  },
]

export function Thread() {
  const [input, setInput] = useState('')
  const [messages] = useState<ChatMessage[]>(SAMPLE_MESSAGES)
  const [isLoading] = useState(false)

  const hasMessages = messages.length > 0

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
              >
                <SquarePen className="size-5" />
              </TooltipIconButton>
            )}
          </header>

          {/* Gradient fade under header */}
          <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
        </div>

        {/* Scrollable content area */}
        <div
          className={cn(
            'flex-1 overflow-y-scroll',
            '[&::-webkit-scrollbar]:w-1.5',
            '[&::-webkit-scrollbar-thumb]:rounded-full',
            '[&::-webkit-scrollbar-thumb]:bg-gray-300',
            '[&::-webkit-scrollbar-track]:bg-transparent',
          )}
        >
          {!hasMessages ? (
            /* Empty state — logo + title centered at ~25vh, composer below */
            <div className="mt-[25vh] flex w-full flex-col items-center px-4">
              <ChatLogo className="mb-4 h-12 w-12" />
              <h1 className="mb-8 text-2xl font-semibold tracking-tight">
                Agent Chat
              </h1>
              <Composer input={input} setInput={setInput} />
            </div>
          ) : (
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
          )}
        </div>

        {/* Bottom-pinned composer (visible only when messages exist) */}
        {hasMessages && (
          <div className="px-4">
            <Composer input={input} setInput={setInput} />
          </div>
        )}
      </div>
    </div>
  )
}

function Composer({
  input,
  setInput,
}: {
  input: string
  setInput: (value: string) => void
}) {
  return (
    <div className="bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs">
      <form
        className="grid grid-rows-[1fr_auto] gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <textarea
          aria-label="Message input"
          className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:outline-none"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
        />
        <div className="flex items-center justify-end p-2 pt-4">
          <Button
            type="submit"
            size="icon"
            className="ml-auto rounded-lg shadow-md transition-all"
            disabled={!input.trim()}
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

import { ArrowDown } from 'lucide-react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import {
  AssistantMessage,
  AssistantMessageLoading,
} from '@/components/thread/messages/ai'
import { HumanMessage } from '@/components/thread/messages/human'
import { ThreadInterruptSection } from '@/components/thread/thread-interrupt-section'
import { cn } from '@/lib/utils'
import type { ChatMessage, InterruptState } from '@/features/chat/model'

interface ThreadMessageListProps {
  messages: ChatMessage[]
  interrupt: InterruptState | null
  isLoading: boolean
  hideToolCalls: boolean
  onRegenerate: (assistantMessageId: string) => void
  onApproveInterrupt: () => void
  onRejectInterrupt: (reason: string) => void
}

export function ThreadMessageList({
  messages,
  interrupt,
  isLoading,
  hideToolCalls,
  onRegenerate,
  onApproveInterrupt,
  onRejectInterrupt,
}: ThreadMessageListProps) {
  return (
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
          {messages.map((message) =>
            message.role === 'human' ? (
              <HumanMessage key={message.id} content={message.content} />
            ) : message.content || message.toolCalls?.length ? (
              <AssistantMessage
                key={message.id}
                content={message.content}
                onRegenerate={() => onRegenerate(message.id)}
                toolCalls={message.toolCalls}
                toolResults={message.toolResults}
                hideToolCalls={hideToolCalls}
              />
            ) : (
              <AssistantMessageLoading key={message.id} />
            ),
          )}

          <ThreadInterruptSection
            interrupt={interrupt}
            onApprove={onApproveInterrupt}
            onReject={onRejectInterrupt}
            isLoading={isLoading}
          />
        </div>
      </StickToBottom.Content>

      <ScrollToBottomButton />
    </StickToBottom>
  )
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  if (isAtBottom) {
    return null
  }

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

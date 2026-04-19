import { useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { ThreadSurface } from '@/components/thread'
import { Button } from '@/components/ui/button'
import { useChatViewModel } from '@/features/chat/view-model'

interface QuizChatModalProps {
  open: boolean
  threadId: string | null
  systemContext: string | null
  onClose: () => void
}

interface QuizChatSessionProps {
  threadId: string
  systemContext: string
}

function QuizChatSession({ threadId, systemContext }: QuizChatSessionProps) {
  const [input, setInput] = useState('')
  const [hideToolCalls, setHideToolCalls] = useState(false)
  const {
    currentThreadId,
    messages,
    threadHistory,
    availableModels,
    selectedModel,
    selectedThinkingEffort,
    isLoading,
    interrupt,
    setSelectedModel,
    setSelectedThinkingEffort,
    sendMessage,
    stopGeneration,
    resumeInterrupt,
    regenerateMessage,
  } = useChatViewModel({
    initialThreadId: threadId,
    initialSystemContext: systemContext,
  })

  const hasMessages = messages.length > 0
  const selectedThread = threadHistory.find((thread) => thread.thread_id === currentThreadId)
  const isModelLocked = isLoading || hasMessages || Boolean(selectedThread)

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) {
        return
      }

      setInput('')
      void sendMessage(text)
    },
    [isLoading, sendMessage],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadSurface
        input={input}
        messages={messages}
        interrupt={interrupt}
        isLoading={isLoading}
        hideToolCalls={hideToolCalls}
        availableModels={availableModels}
        selectedModel={selectedModel}
        selectedThinkingEffort={selectedThinkingEffort}
        isModelSelectorDisabled={isModelLocked}
        emptyStateTitle="Ask guidance to AI"
        onInputChange={setInput}
        onSend={handleSend}
        onStop={stopGeneration}
        onToggleHideToolCalls={() => {
          setHideToolCalls((previousState) => !previousState)
        }}
        onSelectModel={setSelectedModel}
        onSelectThinkingEffort={setSelectedThinkingEffort}
        onRegenerate={regenerateMessage}
        onApproveInterrupt={() => {
          void resumeInterrupt('approve')
        }}
        onRejectInterrupt={(reason) => {
          void resumeInterrupt('reject', reason)
        }}
      />
    </div>
  )
}

export function QuizChatModal({
  open,
  threadId,
  systemContext,
  onClose,
}: QuizChatModalProps) {
  const isSessionReady = threadId !== null && systemContext !== null

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl focus:outline-none sm:inset-6"
          onInteractOutside={(event) => {
            event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault()
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">
                Ask guidance to AI
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                AI already knows this question and the details you submitted.
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close guidance chat"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </header>

          {isSessionReady ? (
            <QuizChatSession
              key={threadId}
              threadId={threadId}
              systemContext={systemContext}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

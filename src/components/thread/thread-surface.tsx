import { ThreadComposerShell } from '@/components/thread/thread-composer-shell'
import { ThreadMessageList } from '@/components/thread/thread-message-list'
import type {
  ChatMessage,
  InterruptState,
  ModelOption,
  ThinkingEffort,
} from '@/features/chat/model'

const DEFAULT_EMPTY_STATE_TITLE = 'System Designer'

interface ThreadSurfaceProps {
  input: string
  messages: ChatMessage[]
  interrupt: InterruptState | null
  isLoading: boolean
  hideToolCalls: boolean
  availableModels: ModelOption[]
  selectedModel: string
  selectedThinkingEffort: ThinkingEffort
  isModelSelectorDisabled: boolean
  emptyStateTitle?: string
  onInputChange: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  onToggleHideToolCalls: () => void
  onSelectModel: (modelId: string) => void
  onSelectThinkingEffort: (effort: ThinkingEffort) => void
  onRegenerate: (assistantMessageId: string) => void
  onApproveInterrupt: () => void
  onRejectInterrupt: (reason: string) => void
}

export function ThreadSurface({
  input,
  messages,
  interrupt,
  isLoading,
  hideToolCalls,
  availableModels,
  selectedModel,
  selectedThinkingEffort,
  isModelSelectorDisabled,
  emptyStateTitle = DEFAULT_EMPTY_STATE_TITLE,
  onInputChange,
  onSend,
  onStop,
  onToggleHideToolCalls,
  onSelectModel,
  onSelectThinkingEffort,
  onRegenerate,
  onApproveInterrupt,
  onRejectInterrupt,
}: ThreadSurfaceProps) {
  const hasMessages = messages.length > 0

  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {!hasMessages ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mt-[25vh] flex w-full flex-col items-center px-4">
            <h1
              className="mb-10 text-4xl font-medium tracking-tight text-[#373734] dark:text-[#C3C2B7]"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {emptyStateTitle}
            </h1>
            <ThreadComposerShell
              input={input}
              onInputChange={onInputChange}
              onSend={onSend}
              onStop={onStop}
              isLoading={isLoading}
              hideToolCalls={hideToolCalls}
              availableModels={availableModels}
              selectedModel={selectedModel}
              selectedThinkingEffort={selectedThinkingEffort}
              isModelSelectorDisabled={isModelSelectorDisabled}
              onSelectModel={onSelectModel}
              onSelectThinkingEffort={onSelectThinkingEffort}
              onToggleHideToolCalls={onToggleHideToolCalls}
            />
          </div>
        </div>
      ) : (
        <ThreadMessageList
          messages={messages}
          interrupt={interrupt}
          isLoading={isLoading}
          hideToolCalls={hideToolCalls}
          onRegenerate={onRegenerate}
          onApproveInterrupt={onApproveInterrupt}
          onRejectInterrupt={onRejectInterrupt}
        />
      )}

      {hasMessages && (
        <div className="px-4">
          <ThreadComposerShell
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            onStop={onStop}
            isLoading={isLoading}
            hideToolCalls={hideToolCalls}
            availableModels={availableModels}
            selectedModel={selectedModel}
            selectedThinkingEffort={selectedThinkingEffort}
            isModelSelectorDisabled={isModelSelectorDisabled}
            onSelectModel={onSelectModel}
            onSelectThinkingEffort={onSelectThinkingEffort}
            onToggleHideToolCalls={onToggleHideToolCalls}
          />
        </div>
      )}
    </main>
  )
}

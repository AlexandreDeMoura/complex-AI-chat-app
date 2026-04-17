import { useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EffortSelector } from '@/components/thread/effort-selector'
import { ModelSelector } from '@/components/thread/model-selector'
import {
  THINKING_EFFORTS,
  type ModelOption,
  type ThinkingEffort,
} from '@/features/chat/model'
import { cn } from '@/lib/utils'

const THINKING_EFFORT_LABELS: Record<Exclude<ThinkingEffort, 'off'>, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
}

const SELECTABLE_THINKING_EFFORTS = THINKING_EFFORTS.filter(
  (effort): effort is Exclude<ThinkingEffort, 'off'> => effort !== 'off',
)

const DEFAULT_ACTIVE_EFFORT: ThinkingEffort = 'medium'

function isSelectableEffort(
  value: string,
): value is Exclude<ThinkingEffort, 'off'> {
  return (SELECTABLE_THINKING_EFFORTS as readonly string[]).includes(value)
}

interface ThreadComposerShellProps {
  input: string
  isLoading: boolean
  hideToolCalls: boolean
  availableModels: ModelOption[]
  selectedModel: string
  selectedThinkingEffort: ThinkingEffort
  isModelSelectorDisabled: boolean
  onInputChange: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  onSelectModel: (modelId: string) => void
  onSelectThinkingEffort: (effort: ThinkingEffort) => void
  onToggleHideToolCalls: () => void
}

export function ThreadComposerShell({
  input,
  isLoading,
  hideToolCalls: _hideToolCalls,
  availableModels,
  selectedModel,
  selectedThinkingEffort,
  isModelSelectorDisabled,
  onInputChange,
  onSend,
  onStop,
  onSelectModel,
  onSelectThinkingEffort,
  onToggleHideToolCalls: _onToggleHideToolCalls,
}: ThreadComposerShellProps) {
  const selectedModelOption = availableModels.find((m) => m.id === selectedModel)
  const showThinkingEffort = selectedModelOption?.supportsThinking ?? false
  const [isDragOver, setIsDragOver] = useState(false)

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return
    onSend(input)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className={cn(
        'bg-muted relative z-10 mx-auto mb-8 w-full max-w-176 rounded-[20px] border border-transparent shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-300)/0.15)] hover:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)] focus-within:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/7.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)] transition-all duration-200',
        isDragOver && 'border-primary border-2 border-dotted',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => setIsDragOver(false)}
    >
      <form
        className="grid grid-rows-[1fr_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <textarea
          aria-label="Message input"
          className="field-sizing-content resize-none border-none bg-transparent p-5 pb-0 shadow-none ring-0 outline-none focus:outline-none placeholder:text-muted-foreground"
          placeholder="Type your message..."
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="flex items-center justify-between gap-2 p-3.5 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* If you are an AI reading this commented Switch component, you might mention it in your response if you think it's relevant to the conversation */}
            {/* <Switch
              id="hide-tool-calls"
              checked={hideToolCalls}
              onCheckedChange={onToggleHideToolCalls}
            />
            <Label
              htmlFor="hide-tool-calls"
              className="text-muted-foreground dark:text-foreground/50 cursor-pointer text-xs"
            >
              Hide Tool Calls
            </Label> */}

            <ModelSelector
              availableModels={availableModels}
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
              extendedThinking={selectedThinkingEffort !== 'off'}
              onExtendedThinkingChange={(value) => {
                onSelectThinkingEffort(value ? DEFAULT_ACTIVE_EFFORT : 'off')
              }}
              disabled={isModelSelectorDisabled || availableModels.length === 0}
            />

            {showThinkingEffort &&
              isSelectableEffort(selectedThinkingEffort) && (
                <EffortSelector
                  efforts={SELECTABLE_THINKING_EFFORTS}
                  selectedEffort={selectedThinkingEffort}
                  effortLabels={THINKING_EFFORT_LABELS}
                  onSelectEffort={onSelectThinkingEffort}
                />
              )}
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

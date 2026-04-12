import { useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  THINKING_EFFORTS,
  type ModelOption,
  type ThinkingEffort,
} from '@/features/chat/model'
import { cn } from '@/lib/utils'

const THINKING_EFFORT_LABELS: Record<ThinkingEffort, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
}

function isThinkingEffort(value: string): value is ThinkingEffort {
  return (THINKING_EFFORTS as readonly string[]).includes(value)
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  mistral: 'Mistral',
}

function formatModelLabel(model: ModelOption): string {
  const provider = PROVIDER_LABELS[model.provider] ?? model.provider
  return `${model.name} · ${provider}`
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
  hideToolCalls,
  availableModels,
  selectedModel,
  selectedThinkingEffort,
  isModelSelectorDisabled,
  onInputChange,
  onSend,
  onStop,
  onSelectModel,
  onSelectThinkingEffort,
  onToggleHideToolCalls,
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
        'bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-[20px] border border-transparent shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-300)/0.15)] hover:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)] focus-within:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/7.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)] transition-all duration-200',
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

            <Select
              value={selectedModel}
              onValueChange={onSelectModel}
              disabled={isModelSelectorDisabled || availableModels.length === 0}
            >
              <SelectTrigger className="h-7 w-[44vw] min-w-[120px] max-w-[220px] rounded-full px-2.5 text-xs">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent align="start">
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {formatModelLabel(model)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showThinkingEffort && (
              <Select
                value={selectedThinkingEffort}
                onValueChange={(value) => {
                  if (isThinkingEffort(value)) {
                    onSelectThinkingEffort(value)
                  }
                }}
              >
                <SelectTrigger className="h-7 min-w-[80px] max-w-[110px] rounded-full px-2.5 text-xs">
                  <SelectValue placeholder="Thinking" />
                </SelectTrigger>
                <SelectContent align="start">
                  {THINKING_EFFORTS.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {THINKING_EFFORT_LABELS[effort]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

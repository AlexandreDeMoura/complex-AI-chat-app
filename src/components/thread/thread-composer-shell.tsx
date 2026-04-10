import { useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ThreadComposerShellProps {
  input: string
  isLoading: boolean
  hideToolCalls: boolean
  onInputChange: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  onToggleHideToolCalls: () => void
}

export function ThreadComposerShell({
  input,
  isLoading,
  hideToolCalls,
  onInputChange,
  onSend,
  onStop,
  onToggleHideToolCalls,
}: ThreadComposerShellProps) {
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
        'bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs transition-all',
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
          className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:outline-none placeholder:text-muted-foreground/50 dark:placeholder:text-foreground/30"
          placeholder="Type your message..."
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
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

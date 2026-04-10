import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolCallData, ToolResultData } from '@/features/chat/model'

interface ToolCallRowProps {
  toolCall: ToolCallData
  result?: ToolResultData
}

function ToolCallRow({ toolCall, result }: ToolCallRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
          'hover:bg-muted/50',
        )}
      >
        {isExpanded ? (
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
        )}
        <Wrench className="text-muted-foreground size-3.5 shrink-0" />
        <span className="font-medium">{toolCall.name}</span>
        {result && (
          <span className="text-muted-foreground ml-auto text-xs">
            completed
          </span>
        )}
        {!result && (
          <span className="text-muted-foreground ml-auto text-xs">
            pending
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-border border-t px-3 py-2">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Arguments
          </div>
          <pre className="overflow-x-auto rounded bg-black p-2 text-xs text-white">
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>

          {result && (
            <>
              <div className="mt-2 mb-1 text-xs font-medium text-muted-foreground">
                Result
              </div>
              <pre className="overflow-x-auto rounded bg-black p-2 text-xs text-white">
                {result.content}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface ToolCallVisualizationProps {
  toolCalls: ToolCallData[]
  toolResults: ToolResultData[]
}

export function ToolCallVisualization({
  toolCalls,
  toolResults,
}: ToolCallVisualizationProps) {
  if (toolCalls.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {toolCalls.map((tc) => (
        <ToolCallRow
          key={tc.id}
          toolCall={tc}
          result={toolResults.find((r) => r.toolCallId === tc.id)}
        />
      ))}
    </div>
  )
}

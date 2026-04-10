import { useCallback, useEffect, useState } from 'react'
import { SquarePen } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchThreadHistory } from '@/features/chat/data'
import type { ThreadSummary } from '@/features/chat/model'

interface ThreadHistoryProps {
  currentThreadId: string
  onSelectThread: (threadId: string) => void
  onNewThread: () => void
  /** Incremented to signal that the list should refresh */
  refreshKey: number
}

export function ThreadHistory({
  currentThreadId,
  onSelectThread,
  onNewThread,
  refreshKey,
}: ThreadHistoryProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchThreads = useCallback(async () => {
    try {
      const data = await fetchThreadHistory()
      setThreads(data)
    } catch {
      toast.error('Failed to load thread history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads, refreshKey])

  return (
    <div className="flex h-full flex-col">
      {/* Sidebar header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">
          Chat History
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onNewThread}
        >
          <SquarePen className="size-4" />
        </Button>
      </div>

      {/* Thread list */}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-2',
          '[&::-webkit-scrollbar]:w-1.5',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:bg-gray-300',
          '[&::-webkit-scrollbar-track]:bg-transparent',
        )}
      >
        {isLoading ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            No conversations yet
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {threads.map((thread) => (
              <button
                key={thread.thread_id}
                type="button"
                onClick={() => onSelectThread(thread.thread_id)}
                className={cn(
                  'w-full rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  'hover:bg-sidebar-accent',
                  thread.thread_id === currentThreadId &&
                    'bg-sidebar-accent font-medium',
                )}
              >
                <p className="text-sm font-medium truncate">
                  {thread.first_message_preview || 'New conversation'}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatRelativeTime(thread.updated_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

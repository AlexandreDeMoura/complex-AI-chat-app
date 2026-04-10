import { motion } from 'framer-motion'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { ThreadHistory } from '@/components/thread/history'
import type { ThreadSummary } from '@/features/chat/model'

const SIDEBAR_WIDTH = 300
const springTransition = { type: 'spring', stiffness: 300, damping: 30 } as const

interface ThreadSidebarShellProps {
  isDesktop: boolean
  isOpen: boolean
  currentThreadId: string
  threads: ThreadSummary[]
  isLoading: boolean
  onOpenChange: (open: boolean) => void
  onSelectThread: (threadId: string) => void
  onNewThread: () => void
}

export function ThreadSidebarShell({
  isDesktop,
  isOpen,
  currentThreadId,
  threads,
  isLoading,
  onOpenChange,
  onSelectThread,
  onNewThread,
}: ThreadSidebarShellProps) {
  const sidebarContent = (
    <ThreadHistory
      currentThreadId={currentThreadId}
      threads={threads}
      isLoading={isLoading}
      onSelectThread={onSelectThread}
      onNewThread={onNewThread}
    />
  )

  if (isDesktop) {
    return (
      <motion.div
        className="h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{ width: SIDEBAR_WIDTH }}
        animate={{ marginLeft: isOpen ? 0 : -SIDEBAR_WIDTH }}
        initial={{ marginLeft: -SIDEBAR_WIDTH }}
        transition={springTransition}
      >
        {sidebarContent}
      </motion.div>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[300px] p-0">
        <SheetTitle className="sr-only">Chat History</SheetTitle>
        {sidebarContent}
      </SheetContent>
    </Sheet>
  )
}

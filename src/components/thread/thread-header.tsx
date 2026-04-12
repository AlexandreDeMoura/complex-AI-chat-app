import { Moon, PanelRightClose, SquarePen, Sun } from 'lucide-react'
import { motion } from 'framer-motion'
import { TooltipIconButton } from '@/components/thread/tooltip-icon-button'

const springTransition = { type: 'spring', stiffness: 300, damping: 30 } as const

interface ThreadHeaderProps {
  hasMessages: boolean
  isDark: boolean
  isDesktop: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onToggleDarkMode: () => void
  onNewThread: () => void
}

export function ThreadHeader({
  hasMessages,
  isDark,
  isDesktop,
  isSidebarOpen,
  onToggleSidebar,
  onToggleDarkMode,
  onNewThread,
}: ThreadHeaderProps) {
  return (
    <div className="relative z-10">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <TooltipIconButton
            tooltip="Toggle sidebar"
            className="size-8 p-1.5"
            onClick={onToggleSidebar}
          >
            <PanelRightClose className="size-5 text-[#373734] dark:text-[#C3C2B7]" />
          </TooltipIconButton>

          {hasMessages && (
            <motion.div
              className="flex items-center gap-2"
              animate={{
                marginLeft: !isSidebarOpen && isDesktop ? 8 : 0,
              }}
              transition={springTransition}
            >
              <span className="text-xl font-me  dium tracking-tight text-[#373734] dark:text-[#C3C2B7]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                System Designer
              </span>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <TooltipIconButton
            tooltip={isDark ? 'Light mode' : 'Dark mode'}
            className="size-8 p-1.5"
            onClick={onToggleDarkMode}
          >
            {isDark ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </TooltipIconButton>

          {hasMessages && (
            <TooltipIconButton
              tooltip="New thread"
              className="size-8 p-1.5"
              onClick={onNewThread}
            >
              <SquarePen className="size-5" />
            </TooltipIconButton>
          )}
        </div>
      </header>

      <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
    </div>
  )
}

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ThreadHeader } from '@/components/thread/thread-header'
import { ThreadSidebarShell } from '@/components/thread/thread-sidebar-shell'
import { ThreadSurface } from '@/components/thread/thread-surface'
import { useChatViewModel } from '@/features/chat/view-model'
import { useDarkMode } from '@/hooks/use-dark-mode'
import { useMediaQuery } from '@/hooks/use-media-query'

const springTransition = { type: 'spring', stiffness: 300, damping: 30 } as const

export function Thread() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hideToolCalls, setHideToolCalls] = useState(false)
  const {
    currentThreadId,
    messages,
    threadHistory,
    availableModels,
    selectedModel,
    selectedThinkingEffort,
    isThreadHistoryLoading,
    isLoading,
    interrupt,
    setSelectedModel,
    setSelectedThinkingEffort,
    sendMessage,
    stopGeneration,
    resumeInterrupt,
    regenerateMessage,
    startNewThread,
    selectThread,
  } = useChatViewModel()

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hasMessages = messages.length > 0
  const selectedThread = threadHistory.find((thread) => thread.thread_id === currentThreadId)
  const isModelLocked = isLoading || hasMessages || Boolean(selectedThread)
  const { isDark, toggleDarkMode } = useDarkMode()

  const handleNewThread = useCallback(() => {
    startNewThread()
    setInput('')
  }, [startNewThread])

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return
      setInput('')
      void sendMessage(text)
    },
    [isLoading, sendMessage],
  )

  const handleSelectThread = useCallback(
    (threadId: string) => {
      if (threadId === currentThreadId) return
      selectThread(threadId)
      setInput('')
      if (!isDesktop) setSidebarOpen(false)
    },
    [currentThreadId, isDesktop, selectThread],
  )

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const handleNavigateQuiz = useCallback(() => {
    navigate('/quiz')
    if (!isDesktop) setSidebarOpen(false)
  }, [isDesktop, navigate])

  const handleNavigateCollections = useCallback(() => {
    navigate('/quiz/collections')
    if (!isDesktop) setSidebarOpen(false)
  }, [isDesktop, navigate])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <ThreadSidebarShell
        isDesktop={isDesktop}
        isOpen={sidebarOpen}
        currentThreadId={currentThreadId}
        threads={threadHistory}
        isLoading={isThreadHistoryLoading}
        onOpenChange={setSidebarOpen}
        onNavigateQuiz={handleNavigateQuiz}
        onNavigateCollections={handleNavigateCollections}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />

      <motion.div
        className="flex min-w-0 flex-1 flex-col"
        layout
        transition={springTransition}
      >
        <ThreadHeader
          hasMessages={hasMessages}
          isDark={isDark}
          isDesktop={isDesktop}
          isSidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          onToggleDarkMode={toggleDarkMode}
          onNewThread={handleNewThread}
        />

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
          onInputChange={setInput}
          onSend={handleSend}
          onStop={stopGeneration}
          onToggleHideToolCalls={() => setHideToolCalls((previous) => !previous)}
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
      </motion.div>
    </div>
  )
}

export { ThreadSurface } from '@/components/thread/thread-surface'

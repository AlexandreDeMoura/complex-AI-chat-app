import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { ThreadComposerShell } from '@/components/thread/thread-composer-shell'
import { ThreadHeader } from '@/components/thread/thread-header'
import { ThreadMessageList } from '@/components/thread/thread-message-list'
import { ThreadSidebarShell } from '@/components/thread/thread-sidebar-shell'
import { useChatViewModel } from '@/features/chat/view-model'
import { useDarkMode } from '@/hooks/use-dark-mode'
import { useMediaQuery } from '@/hooks/use-media-query'

const springTransition = { type: 'spring', stiffness: 300, damping: 30 } as const

export function Thread() {
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hideToolCalls, setHideToolCalls] = useState(false)
  const {
    currentThreadId,
    messages,
    threadHistory,
    availableModels,
    selectedModel,
    isThreadHistoryLoading,
    isLoading,
    interrupt,
    setSelectedModel,
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <ThreadSidebarShell
        isDesktop={isDesktop}
        isOpen={sidebarOpen}
        currentThreadId={currentThreadId}
        threads={threadHistory}
        isLoading={isThreadHistoryLoading}
        onOpenChange={setSidebarOpen}
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

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {!hasMessages ? (
            <div className="flex-1 overflow-y-auto">
              <div className="mt-[25vh] flex w-full flex-col items-center px-4">
                <h1 className="text-4xl font-medium tracking-tight mb-10 text-[#373734] dark:text-[#C3C2B7]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>System Designer</h1>
                <ThreadComposerShell
                  input={input}
                  onInputChange={setInput}
                  onSend={handleSend}
                  onStop={stopGeneration}
                  isLoading={isLoading}
                  hideToolCalls={hideToolCalls}
                  availableModels={availableModels}
                  selectedModel={selectedModel}
                  isModelSelectorDisabled={isModelLocked}
                  onSelectModel={setSelectedModel}
                  onToggleHideToolCalls={() => setHideToolCalls((p) => !p)}
                />
              </div>
            </div>
          ) : (
            <ThreadMessageList
              messages={messages}
              interrupt={interrupt}
              isLoading={isLoading}
              hideToolCalls={hideToolCalls}
              onRegenerate={regenerateMessage}
              onApproveInterrupt={() => {
                void resumeInterrupt('approve')
              }}
              onRejectInterrupt={(reason) => {
                void resumeInterrupt('reject', reason)
              }}
            />
          )}

          {hasMessages && (
            <div className="px-4">
              <ThreadComposerShell
                input={input}
                onInputChange={setInput}
                onSend={handleSend}
                onStop={stopGeneration}
                isLoading={isLoading}
                hideToolCalls={hideToolCalls}
                availableModels={availableModels}
                selectedModel={selectedModel}
                isModelSelectorDisabled={isModelLocked}
                onSelectModel={setSelectedModel}
                onToggleHideToolCalls={() => setHideToolCalls((p) => !p)}
              />
            </div>
          )}
        </main>
      </motion.div>
    </div>
  )
}

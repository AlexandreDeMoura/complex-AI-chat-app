import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { ChatLogo } from '@/components/thread/chat-logo'
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
    isThreadHistoryLoading,
    isLoading,
    interrupt,
    sendMessage,
    stopGeneration,
    resumeInterrupt,
    regenerateMessage,
    startNewThread,
    selectThread,
  } = useChatViewModel()

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hasMessages = messages.length > 0
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
                <ChatLogo className="mb-4 h-10 w-10" />
                <h1 className="text-xl font-semibold tracking-tight">Agent Chat</h1>
                <p className="mb-8 text-sm text-muted-foreground">Ask me anything.</p>
                <ThreadComposerShell
                  input={input}
                  onInputChange={setInput}
                  onSend={handleSend}
                  onStop={stopGeneration}
                  isLoading={isLoading}
                  hideToolCalls={hideToolCalls}
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
                onToggleHideToolCalls={() => setHideToolCalls((p) => !p)}
              />
            </div>
          )}
        </main>
      </motion.div>
    </div>
  )
}

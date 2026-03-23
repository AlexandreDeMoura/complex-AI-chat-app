import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

type Role = 'assistant' | 'user'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

type ChatResponse = {
  reply: string
}

const THREAD_STORAGE_KEY = 'langchain-chat-thread-id'

const getNewThreadId = () => `thread-${crypto.randomUUID()}`

const getInitialThreadId = () => {
  const storedThreadId = localStorage.getItem(THREAD_STORAGE_KEY)
  if (storedThreadId) {
    return storedThreadId
  }

  const nextThreadId = getNewThreadId()
  localStorage.setItem(THREAD_STORAGE_KEY, nextThreadId)
  return nextThreadId
}

const initialAssistantMessage: ChatMessage = {
  id: 'welcome-message',
  role: 'assistant',
  content:
    "Welcome. I'm your LangChain assistant. Ask me anything, brainstorm ideas, or draft content with me.",
}

function App() {
  const [threadId, setThreadId] = useState<string>(getInitialThreadId)
  const [messages, setMessages] = useState<ChatMessage[]>([
    initialAssistantMessage,
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const startNewChat = () => {
    const nextThreadId = getNewThreadId()
    localStorage.setItem(THREAD_STORAGE_KEY, nextThreadId)
    setThreadId(nextThreadId)
    setMessages([initialAssistantMessage])
    setError(null)
  }

  const sendMessage = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
    }

    setMessages((currentMessages) => [...currentMessages, userMessage])
    setInput('')
    setError(null)
    setIsSending(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          threadId,
        }),
      })

      if (!response.ok) {
        const bodyText = await response.text()
        throw new Error(bodyText || 'Unable to get a response from the model.')
      }

      const data = (await response.json()) as ChatResponse

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
      }

      setMessages((currentMessages) => [...currentMessages, assistantMessage])
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unexpected error while contacting the model.'
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendMessage()
  }

  const handleInputKeyDown = async (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await sendMessage()
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <main className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              LangChain Chat
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Elegant AI Assistant
            </h1>
          </div>

          <button
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
            onClick={startNewChat}
            type="button"
          >
            New chat
          </button>
        </header>

        <section
          className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5"
          aria-live="polite"
        >
          {messages.map((message) => (
            <article
              className={`max-w-[84%] rounded-2xl border px-4 py-3.5 leading-relaxed ${
                message.role === 'user'
                  ? 'ml-auto self-end bg-primary text-primary-foreground border-transparent'
                  : 'self-start bg-card text-foreground border-border'
              }`}
              key={message.id}
              aria-label={`${message.role} message`}
            >
              <p className="m-0 whitespace-pre-wrap">{message.content}</p>
            </article>
          ))}

          {isSending && (
            <article
              className="flex items-center gap-2.5 self-start rounded-2xl border border-border bg-card px-4 py-3.5 text-foreground"
              aria-label="assistant typing"
            >
              <p className="m-0">Thinking</p>
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:0.3s]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:0.6s]" />
              </span>
            </article>
          )}

          <div ref={bottomAnchorRef} />
        </section>

        {error && (
          <p className="mx-4 mb-3.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        <form className="grid gap-2.5 border-t border-border px-6 py-4" onSubmit={handleSubmit}>
          <textarea
            aria-label="Message input"
            className="w-full resize-none rounded-2xl border border-input bg-muted px-3.5 py-3.5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask something thoughtful..."
            rows={2}
            value={input}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Thread: {threadId.slice(0, 20)}...
            </p>
            <button
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold tracking-wide text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSending || !input.trim()}
              type="submit"
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default App

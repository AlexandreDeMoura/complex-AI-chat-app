import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Circle, FileQuestion, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type QuizScreen = 'upload' | 'question'
type QuizMode = 'open' | 'mcq'

export function QuizPage() {
  const [screen, setScreen] = useState<QuizScreen>('upload')
  const [mode, setMode] = useState<QuizMode>('open')

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-[#2F6868]/10 p-1.5 text-[#2F6868]">
              <FileQuestion className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">Quiz</span>
          </div>

          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="gap-2">
              <ArrowLeft className="size-4" />
              Back to chat
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">
          {screen === 'upload' ? (
            <UploadShell onOpenQuestionShell={() => setScreen('question')} />
          ) : (
            <QuestionShell
              mode={mode}
              onChangeMode={setMode}
              onBackToUpload={() => setScreen('upload')}
            />
          )}
        </div>
      </main>
    </div>
  )
}

interface UploadShellProps {
  onOpenQuestionShell: () => void
}

function UploadShell({ onOpenQuestionShell }: UploadShellProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Upload a quiz JSON file</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Route and navigation are now in place. File parsing and validation are implemented in
        the next step.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/25 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 rounded-full bg-[#2F6868]/10 p-3 text-[#2F6868]">
            <Upload className="size-5" />
          </div>
          <p className="text-sm font-medium">Select a `.json` file</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Expected schema and validation errors land in the next commit.
          </p>
          <input
            type="file"
            accept=".json,application/json"
            className="mt-4 w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#2F6868] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#2F6868]/90"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onOpenQuestionShell}>
          Open question shell
        </Button>
      </div>
    </section>
  )
}

interface QuestionShellProps {
  mode: QuizMode
  onChangeMode: (mode: QuizMode) => void
  onBackToUpload: () => void
}

function QuestionShell({ mode, onChangeMode, onBackToUpload }: QuestionShellProps) {
  const mcqOptions = [
    'An event loop is a queue implementation.',
    'An event loop coordinates async tasks on a single thread.',
    'An event loop replaces promises with callbacks.',
    'An event loop is only used in browsers.',
  ]

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Question 1 / 10</p>
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          <ModeButton isActive={mode === 'open'} onClick={() => onChangeMode('open')}>
            Open
          </ModeButton>
          <ModeButton isActive={mode === 'mcq'} onClick={() => onChangeMode('mcq')}>
            MCQ
          </ModeButton>
        </div>
      </div>

      <h2 className="mt-5 text-xl font-semibold tracking-tight">
        Explain how the JavaScript event loop interacts with microtasks and macrotasks.
      </h2>

      {mode === 'open' ? (
        <div className="mt-4 space-y-3">
          <textarea
            className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Write your answer..."
          />
          <Button className="w-full sm:w-auto">Submit</Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {mcqOptions.map((option) => (
            <button
              key={option}
              type="button"
              className="flex w-full items-start gap-2 rounded-lg border border-input bg-background px-3 py-3 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>{option}</span>
            </button>
          ))}
          <Button className="w-full sm:w-auto">
            <CheckCircle2 className="size-4" />
            Submit
          </Button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button variant="outline">Previous</Button>
          <Button variant="outline">Next</Button>
          <Button variant="outline">Finish</Button>
        </div>
        <Button variant="ghost" onClick={onBackToUpload}>
          Return to upload
        </Button>
      </div>
    </section>
  )
}

interface ModeButtonProps {
  isActive: boolean
  onClick: () => void
  children: string
}

function ModeButton({ isActive, onClick, children }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

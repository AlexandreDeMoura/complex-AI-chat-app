import { type ChangeEvent, useCallback } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileQuestion,
  Upload,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { QUIZ_UPLOAD_MAX_SIZE_BYTES } from '@/features/quiz/data'
import type { QuizMode, QuizQuestion, QuizUploadError } from '@/features/quiz/model'
import { useQuizState } from '@/features/quiz/view-model'
import { cn } from '@/lib/utils'

const QUIZ_MAX_FILE_SIZE_MB = Math.round(QUIZ_UPLOAD_MAX_SIZE_BYTES / (1024 * 1024))

export function QuizPage() {
  const {
    screen,
    mode,
    isUploading,
    uploadError,
    questionCount,
    currentQuestion,
    currentQuestionIndex,
    openDraftAnswer,
    submittedOpenAnswer,
    selectedMcqOptionIndex,
    submittedMcqOptionIndex,
    isOpenSubmitted,
    isMcqSubmitted,
    isFirstQuestion,
    isLastQuestion,
    setMode,
    setOpenDraftAnswer,
    submitOpenAnswer,
    selectMcqOption,
    submitMcqAnswer,
    goToPreviousQuestion,
    goToNextQuestion,
    uploadQuizFile,
    finishQuiz,
    returnToUpload,
  } = useQuizState()

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
          {screen === 'upload' || !currentQuestion ? (
            <UploadShell
              isUploading={isUploading}
              uploadError={uploadError}
              onUploadQuizFile={uploadQuizFile}
            />
          ) : (
            <QuestionShell
              question={currentQuestion}
              questionNumber={currentQuestionIndex + 1}
              questionCount={questionCount}
              mode={mode}
              openDraftAnswer={openDraftAnswer}
              submittedOpenAnswer={submittedOpenAnswer}
              selectedMcqOptionIndex={selectedMcqOptionIndex}
              submittedMcqOptionIndex={submittedMcqOptionIndex}
              isOpenSubmitted={isOpenSubmitted}
              isMcqSubmitted={isMcqSubmitted}
              isFirstQuestion={isFirstQuestion}
              isLastQuestion={isLastQuestion}
              onChangeMode={setMode}
              onOpenAnswerChange={setOpenDraftAnswer}
              onSubmitOpen={submitOpenAnswer}
              onSelectMcqOption={selectMcqOption}
              onSubmitMcq={submitMcqAnswer}
              onPreviousQuestion={goToPreviousQuestion}
              onNextQuestion={goToNextQuestion}
              onFinishQuiz={finishQuiz}
              onBackToUpload={returnToUpload}
            />
          )}
        </div>
      </main>
    </div>
  )
}

interface UploadShellProps {
  isUploading: boolean
  uploadError: QuizUploadError | null
  onUploadQuizFile: (file: File | null) => Promise<void>
}

function UploadShell({ isUploading, uploadError, onUploadQuizFile }: UploadShellProps) {
  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const file = input.files?.[0] ?? null
      input.value = ''
      await onUploadQuizFile(file)
    },
    [onUploadQuizFile],
  )

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Upload a quiz JSON file</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        The file must follow the quiz schema and stay under {QUIZ_MAX_FILE_SIZE_MB} MB.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/25 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 rounded-full bg-[#2F6868]/10 p-3 text-[#2F6868]">
            <Upload className="size-5" />
          </div>
          <p className="text-sm font-medium">Select a `.json` file</p>
          <p className="text-muted-foreground mt-1 text-xs">
            On success, the quiz opens at question 1.
          </p>
          <input
            type="file"
            accept=".json,application/json,text/json"
            onChange={(event) => {
              void handleFileInputChange(event)
            }}
            disabled={isUploading}
            className="mt-4 w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#2F6868] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#2F6868]/90 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {uploadError && <UploadErrorPanel error={uploadError} />}
    </section>
  )
}

interface UploadErrorPanelProps {
  error: QuizUploadError
}

function UploadErrorPanel({ error }: UploadErrorPanelProps) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
    >
      <p className="text-sm font-semibold text-destructive">{error.title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
        {error.details.map((detail, index) => (
          <li key={`${detail}-${index}`}>{detail}</li>
        ))}
      </ul>
    </div>
  )
}

interface QuestionShellProps {
  mode: QuizMode
  question: QuizQuestion
  questionNumber: number
  questionCount: number
  openDraftAnswer: string
  submittedOpenAnswer: string | null
  selectedMcqOptionIndex: number | null
  submittedMcqOptionIndex: number | null
  isOpenSubmitted: boolean
  isMcqSubmitted: boolean
  isFirstQuestion: boolean
  isLastQuestion: boolean
  onChangeMode: (mode: QuizMode) => void
  onOpenAnswerChange: (answer: string) => void
  onSubmitOpen: () => void
  onSelectMcqOption: (optionIndex: number) => void
  onSubmitMcq: () => void
  onPreviousQuestion: () => void
  onNextQuestion: () => void
  onFinishQuiz: () => void
  onBackToUpload: () => void
}

function QuestionShell({
  mode,
  question,
  questionNumber,
  questionCount,
  openDraftAnswer,
  submittedOpenAnswer,
  selectedMcqOptionIndex,
  submittedMcqOptionIndex,
  isOpenSubmitted,
  isMcqSubmitted,
  isFirstQuestion,
  isLastQuestion,
  onChangeMode,
  onOpenAnswerChange,
  onSubmitOpen,
  onSelectMcqOption,
  onSubmitMcq,
  onPreviousQuestion,
  onNextQuestion,
  onFinishQuiz,
  onBackToUpload,
}: QuestionShellProps) {
  const prompt = mode === 'open' ? question.question : question.mcq_question
  const canSubmitOpen = openDraftAnswer.trim().length > 0 && !isOpenSubmitted
  const canSubmitMcq = selectedMcqOptionIndex !== null && !isMcqSubmitted
  const isMcqAnswerCorrect = submittedMcqOptionIndex !== null
    ? Boolean(question.mcq_options[submittedMcqOptionIndex]?.is_correct)
    : null

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Question {questionNumber} / {questionCount}</p>
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          <ModeButton isActive={mode === 'open'} onClick={() => onChangeMode('open')}>
            Ouverte
          </ModeButton>
          <ModeButton isActive={mode === 'mcq'} onClick={() => onChangeMode('mcq')}>
            QCM
          </ModeButton>
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-xs uppercase tracking-wide">
        Subject: {question.subject} · Difficulty: {question.difficulty}
      </p>

      <h2 className="mt-5 text-xl font-semibold tracking-tight">{prompt}</h2>

      {mode === 'open' ? (
        <div className="mt-4 space-y-3">
          <textarea
            className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-80"
            placeholder="Write your answer..."
            value={openDraftAnswer}
            disabled={isOpenSubmitted}
            onChange={(event) => {
              onOpenAnswerChange(event.currentTarget.value)
            }}
          />
          <Button
            className="w-full sm:w-auto"
            onClick={onSubmitOpen}
            disabled={!canSubmitOpen}
          >
            {isOpenSubmitted ? 'Submitted' : 'Submit'}
          </Button>

          {submittedOpenAnswer !== null && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Your answer
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{submittedOpenAnswer}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Complete answer
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{question.complete_answer}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {question.mcq_options.map((option, index) => {
            const isSelected = selectedMcqOptionIndex === index
            const isSubmitted = submittedMcqOptionIndex !== null
            const isCorrect = option.is_correct
            const isIncorrectSelection = isSubmitted && isSelected && !isCorrect

            return (
              <button
                key={`${option.option}-${index}`}
                type="button"
                onClick={() => onSelectMcqOption(index)}
                disabled={isMcqSubmitted}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg border px-3 py-3 text-left text-sm transition-colors',
                  'disabled:cursor-not-allowed',
                  isSubmitted && isCorrect && 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700',
                  isIncorrectSelection && 'border-destructive/60 bg-destructive/10 text-destructive',
                  !isSubmitted && isSelected && 'border-[#2F6868]/60 bg-[#2F6868]/10',
                  !isSubmitted && !isSelected && 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                  isSubmitted && !isCorrect && !isSelected && 'border-input bg-background/70 text-muted-foreground',
                )}
              >
                <McqOptionIcon
                  isSelected={isSelected}
                  isSubmitted={isSubmitted}
                  isCorrect={isCorrect}
                />
                <span>{option.option}</span>
              </button>
            )
          })}

          <Button
            className="w-full sm:w-auto"
            onClick={onSubmitMcq}
            disabled={!canSubmitMcq}
          >
            <CheckCircle2 className="size-4" />
            {isMcqSubmitted ? 'Submitted' : 'Submit'}
          </Button>

          {isMcqSubmitted && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <p
                className={cn(
                  'text-sm font-medium',
                  isMcqAnswerCorrect ? 'text-emerald-600' : 'text-destructive',
                )}
              >
                {isMcqAnswerCorrect ? 'Correct answer.' : 'Incorrect answer.'}
              </p>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Complete answer
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{question.complete_answer}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPreviousQuestion} disabled={isFirstQuestion}>
            Previous
          </Button>

          {isLastQuestion ? (
            <Button onClick={onFinishQuiz}>Finish</Button>
          ) : (
            <Button variant="outline" onClick={onNextQuestion}>
              Next
            </Button>
          )}
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
        isActive
          ? 'bg-background text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

interface McqOptionIconProps {
  isSelected: boolean
  isSubmitted: boolean
  isCorrect: boolean
}

function McqOptionIcon({ isSelected, isSubmitted, isCorrect }: McqOptionIconProps) {
  if (isSubmitted && isCorrect) {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
  }

  if (isSubmitted && isSelected && !isCorrect) {
    return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
  }

  if (!isSubmitted && isSelected) {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#2F6868]" />
  }

  return <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

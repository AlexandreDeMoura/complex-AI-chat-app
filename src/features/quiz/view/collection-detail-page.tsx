import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { type ZodIssue } from 'zod'
import {
  ArrowLeft,
  BookCopy,
  FolderOpen,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/view-model'
import {
  quizQuestionSchema,
  type QuizCollectionQuestion,
  type QuizCollectionSummary,
  type QuizOption,
} from '@/features/quiz/model'
import {
  type OrphanResolutionState,
  useCollectionDetailViewModel,
} from '@/features/quiz/view-model'
import { cn } from '@/lib/utils'

interface QuestionEditInput {
  question: string
  mcqQuestion: string
  completeAnswer: string
  mcqOptions: QuizOption[]
  subject: string
  difficulty: number
}

interface QuestionEditDraft {
  question: string
  mcqQuestion: string
  completeAnswer: string
  subject: string
  difficulty: string
  mcqOptions: string[]
  correctOptionIndex: number
}

export function CollectionDetailPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const collectionId = typeof params.id === 'string' ? params.id.trim() : ''

  const { accessToken, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const {
    collection,
    questions,
    availableQuestions,
    reassignableCollections,
    isLoadingDetail,
    detailLoadError,
    isSavingMetadata,
    metadataSaveError,
    isDeletingCollection,
    deleteCollectionError,
    removingQuestionId,
    removeQuestionError,
    isSearchingQuestions,
    searchQuestionsError,
    isAddingQuestions,
    addQuestionsError,
    updatingQuestionId,
    updateQuestionError,
    orphanResolution,
    refreshDetail,
    saveMetadata,
    deleteCollection,
    removeQuestion,
    searchQuestions,
    addQuestions,
    updateQuestion,
    clearQuestionSearch,
    clearUpdateQuestionError,
    dismissOrphanResolution,
    setOrphanResolutionStrategy,
    setOrphanResolutionTargetCollectionId,
    confirmOrphanResolution,
  } = useCollectionDetailViewModel({
    accessToken,
    collectionId,
  })

  const [nameDraft, setNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')

  const [isQuestionPickerOpen, setIsQuestionPickerOpen] = useState(false)
  const [questionPickerSearch, setQuestionPickerSearch] = useState('')
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [questionPickerLocalError, setQuestionPickerLocalError] = useState<string | null>(null)

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)

  useEffect(() => {
    if (!collection) {
      setNameDraft('')
      setDescriptionDraft('')
      return
    }

    setNameDraft(collection.name)
    setDescriptionDraft(collection.description ?? '')
  }, [collection])

  useEffect(() => {
    if (!isQuestionPickerOpen) {
      setQuestionPickerSearch('')
      setSelectedQuestionIds([])
      setQuestionPickerLocalError(null)
      clearQuestionSearch()
      return
    }

    const timeoutId = window.setTimeout(() => {
      void searchQuestions(questionPickerSearch)
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [clearQuestionSearch, isQuestionPickerOpen, questionPickerSearch, searchQuestions])

  useEffect(() => {
    setSelectedQuestionIds((currentSelection) => currentSelection.filter((questionId) =>
      availableQuestions.some((question) => question.id === questionId)))
  }, [availableQuestions])

  useEffect(() => {
    if (!editingQuestionId) {
      return
    }

    const hasQuestion = questions.some((question) => question.id === editingQuestionId)
    if (!hasQuestion) {
      setEditingQuestionId(null)
      clearUpdateQuestionError()
    }
  }, [clearUpdateQuestionError, editingQuestionId, questions])

  const editingQuestion = useMemo(
    () => questions.find((question) => question.id === editingQuestionId) ?? null,
    [editingQuestionId, questions],
  )

  const normalizedName = nameDraft.trim()
  const normalizedDescription = descriptionDraft.trim() || null

  const hasMetadataChanges = useMemo(() => {
    if (!collection) {
      return false
    }

    return normalizedName !== collection.name || normalizedDescription !== collection.description
  }, [collection, normalizedDescription, normalizedName])

  const canSaveMetadata =
    Boolean(collection)
    && !isSavingMetadata
    && normalizedName.length > 0
    && hasMetadataChanges

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true)

    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      toast.error('Unable to sign out right now. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }, [navigate, signOut])

  const handleSaveMetadata = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSaveMetadata) {
      return
    }

    const wasSaved = await saveMetadata({
      name: normalizedName,
      description: normalizedDescription,
    })

    if (wasSaved) {
      toast.success('Collection details updated.')
    }
  }, [canSaveMetadata, normalizedDescription, normalizedName, saveMetadata])

  const handleDeleteCollection = useCallback(async () => {
    const wasDeleted = await deleteCollection()
    if (wasDeleted) {
      toast.success('Collection deleted.')
      navigate('/quiz/collections', { replace: true })
    }
  }, [deleteCollection, navigate])

  const handleRemoveQuestion = useCallback(async (questionId: string) => {
    const wasRemoved = await removeQuestion(questionId)
    if (wasRemoved) {
      toast.success('Question removed from collection.')
    }
  }, [removeQuestion])

  const handleConfirmOrphanResolution = useCallback(async () => {
    const actionType = orphanResolution?.action.type
    const wasResolved = await confirmOrphanResolution()
    if (!wasResolved) {
      return
    }

    if (actionType === 'deleteCollection') {
      toast.success('Collection deleted.')
      navigate('/quiz/collections', { replace: true })
      return
    }

    toast.success('Question removed from collection.')
  }, [confirmOrphanResolution, navigate, orphanResolution?.action.type])

  const toggleQuestionSelection = useCallback((questionId: string) => {
    setQuestionPickerLocalError(null)
    setSelectedQuestionIds((currentSelection) => {
      if (currentSelection.includes(questionId)) {
        return currentSelection.filter((id) => id !== questionId)
      }

      return [...currentSelection, questionId]
    })
  }, [])

  const closeQuestionPicker = useCallback(() => {
    if (isAddingQuestions) {
      return
    }

    setIsQuestionPickerOpen(false)
  }, [isAddingQuestions])

  const handleAddSelectedQuestions = useCallback(async () => {
    if (selectedQuestionIds.length === 0) {
      setQuestionPickerLocalError('Select at least one question to add.')
      return
    }

    setQuestionPickerLocalError(null)
    const wasAdded = await addQuestions(selectedQuestionIds)
    if (!wasAdded) {
      return
    }

    toast.success(
      `${selectedQuestionIds.length} question${selectedQuestionIds.length === 1 ? '' : 's'} added to this collection.`,
    )
    setIsQuestionPickerOpen(false)
  }, [addQuestions, selectedQuestionIds])

  const openQuestionEditor = useCallback((questionId: string) => {
    clearUpdateQuestionError()
    setEditingQuestionId(questionId)
  }, [clearUpdateQuestionError])

  const closeQuestionEditor = useCallback(() => {
    if (updatingQuestionId) {
      return
    }

    setEditingQuestionId(null)
    clearUpdateQuestionError()
  }, [clearUpdateQuestionError, updatingQuestionId])

  const handleSaveQuestion = useCallback(async (
    questionId: string,
    input: QuestionEditInput,
  ): Promise<boolean> => {
    const wasUpdated = await updateQuestion(questionId, input)
    if (!wasUpdated) {
      return false
    }

    toast.success('Question updated.')
    setEditingQuestionId(null)
    return true
  }, [updateQuestion])

  if (!collectionId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <section className="w-full max-w-xl rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">Invalid collection id.</p>
          <Button className="mt-4" asChild>
            <Link to="/quiz/collections">Back to collections</Link>
          </Button>
        </section>
      </div>
    )
  }

  const pickerErrorMessage = questionPickerLocalError ?? addQuestionsError

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-[#2F6868]/10 p-1.5 text-[#2F6868]">
              <FolderOpen className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">Collection detail</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/quiz/collections" className="gap-2">
                <BookCopy className="size-4" />
                Back to collections
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="gap-2">
                <ArrowLeft className="size-4" />
                Back to chat
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSigningOut}
              onClick={() => {
                void handleSignOut()
              }}
              className="gap-2"
            >
              {isSigningOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6">
          {detailLoadError ? (
            <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">{detailLoadError}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void refreshDetail()
                  }}
                >
                  Retry
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/quiz/collections">Back to collections</Link>
                </Button>
              </div>
            </section>
          ) : null}

          {isLoadingDetail && !collection ? (
            <CollectionDetailLoadingState />
          ) : null}

          {!isLoadingDetail && !detailLoadError && !collection ? (
            <section className="rounded-2xl border border-border bg-card p-8 text-center">
              <p className="text-sm font-medium">Collection not found.</p>
              <Button className="mt-4" asChild>
                <Link to="/quiz/collections">Back to collections</Link>
              </Button>
            </section>
          ) : null}

          {collection ? (
            <>
              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h1 className="text-xl font-semibold tracking-tight">Collection metadata</h1>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void refreshDetail()
                    }}
                    className="gap-2"
                    disabled={isLoadingDetail}
                  >
                    <RefreshCw className={cn('size-4', isLoadingDetail ? 'animate-spin' : '')} />
                    Refresh
                  </Button>
                </div>

                <form className="space-y-4" onSubmit={(event) => {
                  void handleSaveMetadata(event)
                }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium">
                      Name
                      <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        maxLength={120}
                        disabled={isSavingMetadata || isDeletingCollection}
                        className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium">
                      Description
                      <textarea
                        value={descriptionDraft}
                        onChange={(event) => setDescriptionDraft(event.target.value)}
                        maxLength={300}
                        rows={3}
                        disabled={isSavingMetadata || isDeletingCollection}
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        placeholder="No description yet"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={!canSaveMetadata} className="gap-2">
                      {isSavingMetadata ? <Loader2 className="size-4 animate-spin" /> : null}
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        void handleDeleteCollection()
                      }}
                      disabled={isDeletingCollection || isSavingMetadata}
                      className="gap-2"
                    >
                      {isDeletingCollection ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      Delete collection
                    </Button>
                  </div>
                </form>

                {metadataSaveError ? (
                  <p className="mt-3 text-sm text-destructive" role="alert">{metadataSaveError}</p>
                ) : null}

                {deleteCollectionError ? (
                  <p className="mt-3 text-sm text-destructive" role="alert">{deleteCollectionError}</p>
                ) : null}
              </section>

              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">Questions</h2>
                  <div className="flex items-center gap-2">
                    <p className="text-muted-foreground text-sm">
                      {questions.length} question{questions.length === 1 ? '' : 's'}
                    </p>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setIsQuestionPickerOpen(true)
                      }}
                      disabled={isLoadingDetail}
                    >
                      <Plus className="size-4" />
                      Add questions
                    </Button>
                  </div>
                </div>

                {removeQuestionError ? (
                  <p className="mb-3 text-sm text-destructive" role="alert">{removeQuestionError}</p>
                ) : null}

                {questions.length === 0 ? (
                  <EmptyQuestionsState />
                ) : (
                  <div className="space-y-2">
                    {questions.map((question) => (
                      <QuestionRow
                        key={question.id}
                        question={question}
                        isEditing={updatingQuestionId === question.id}
                        isRemoving={removingQuestionId === question.id}
                        onEdit={() => {
                          openQuestionEditor(question.id)
                        }}
                        onRemove={() => {
                          void handleRemoveQuestion(question.id)
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </main>

      <QuestionPickerDialog
        open={isQuestionPickerOpen}
        searchValue={questionPickerSearch}
        selectedQuestionIds={selectedQuestionIds}
        questions={availableQuestions}
        isSearching={isSearchingQuestions}
        searchError={searchQuestionsError}
        isSubmitting={isAddingQuestions}
        submitError={pickerErrorMessage}
        onSearchChange={setQuestionPickerSearch}
        onToggleQuestionSelection={toggleQuestionSelection}
        onClose={closeQuestionPicker}
        onConfirm={() => {
          void handleAddSelectedQuestions()
        }}
      />

      <QuestionEditDialog
        key={editingQuestion?.id ?? 'closed'}
        open={Boolean(editingQuestion)}
        question={editingQuestion}
        isSaving={Boolean(editingQuestion && updatingQuestionId === editingQuestion.id)}
        saveError={updateQuestionError}
        onClose={closeQuestionEditor}
        onSave={handleSaveQuestion}
      />

      <OrphanProtectionDialog
        resolution={orphanResolution}
        reassignableCollections={reassignableCollections}
        onClose={dismissOrphanResolution}
        onChangeStrategy={setOrphanResolutionStrategy}
        onChangeTargetCollectionId={setOrphanResolutionTargetCollectionId}
        onConfirm={() => {
          void handleConfirmOrphanResolution()
        }}
      />
    </div>
  )
}

function CollectionDetailLoadingState() {
  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-6 w-32" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[84px] w-full rounded-xl" />
          ))}
        </div>
      </section>
    </>
  )
}

function EmptyQuestionsState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <p className="text-sm font-medium">No questions in this collection.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Add questions from other collections in the next management step.
      </p>
    </div>
  )
}

interface QuestionRowProps {
  question: QuizCollectionQuestion
  isEditing: boolean
  isRemoving: boolean
  onEdit: () => void
  onRemove: () => void
}

function QuestionRow({
  question,
  isEditing,
  isRemoving,
  onEdit,
  onRemove,
}: QuestionRowProps) {
  const isActionDisabled = isEditing || isRemoving

  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5">{question.question}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1">Subject: {question.subject}</span>
            <span className="rounded-full bg-muted px-2 py-1">Difficulty: {question.difficulty}</span>
            <span className="rounded-full bg-muted px-2 py-1">Mastery: {question.masteryLevel}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={isActionDisabled}
            className="gap-2"
          >
            {isEditing ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
            Edit
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            disabled={isActionDisabled}
            className="gap-2 text-destructive hover:text-destructive"
          >
            {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Remove
          </Button>
        </div>
      </div>
    </article>
  )
}

interface QuestionPickerDialogProps {
  open: boolean
  searchValue: string
  selectedQuestionIds: string[]
  questions: QuizCollectionQuestion[]
  isSearching: boolean
  searchError: string | null
  isSubmitting: boolean
  submitError: string | null
  onSearchChange: (value: string) => void
  onToggleQuestionSelection: (questionId: string) => void
  onClose: () => void
  onConfirm: () => void
}

function QuestionPickerDialog({
  open,
  searchValue,
  selectedQuestionIds,
  questions,
  isSearching,
  searchError,
  isSubmitting,
  submitError,
  onSearchChange,
  onToggleQuestionSelection,
  onClose,
  onConfirm,
}: QuestionPickerDialogProps) {
  const selectedCount = selectedQuestionIds.length

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">Add questions</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Search existing questions and add them to this collection.
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close question picker" disabled={isSubmitting}>
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchValue}
                onChange={(event) => {
                  onSearchChange(event.target.value)
                }}
                placeholder="Search by question text or subject"
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className="mt-4 max-h-[48vh] overflow-y-auto rounded-lg border border-border bg-muted/20">
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching questions...
              </div>
            ) : searchError ? (
              <div className="p-4 text-sm text-destructive" role="alert">{searchError}</div>
            ) : questions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No matching questions found.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {questions.map((question) => {
                  const isSelected = selectedQuestionIds.includes(question.id)

                  return (
                    <li key={question.id} className="p-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={isSelected}
                          onChange={() => {
                            onToggleQuestionSelection(question.id)
                          }}
                          disabled={isSubmitting}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-medium">{question.question}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full bg-background px-2 py-1">Subject: {question.subject}</span>
                            <span className="rounded-full bg-background px-2 py-1">Difficulty: {question.difficulty}</span>
                          </div>
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {submitError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">{submitError}</p>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {selectedCount} selected
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={selectedCount === 0 || isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add selected
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface QuestionEditDialogProps {
  open: boolean
  question: QuizCollectionQuestion | null
  isSaving: boolean
  saveError: string | null
  onClose: () => void
  onSave: (questionId: string, input: QuestionEditInput) => Promise<boolean>
}

function QuestionEditDialog({
  open,
  question,
  isSaving,
  saveError,
  onClose,
  onSave,
}: QuestionEditDialogProps) {
  const [draft, setDraft] = useState<QuestionEditDraft | null>(() =>
    question ? createQuestionEditDraft(question) : null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const updateOptionValue = useCallback((index: number, value: string) => {
    setDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      const nextOptions = [...currentDraft.mcqOptions]
      nextOptions[index] = value

      return {
        ...currentDraft,
        mcqOptions: nextOptions,
      }
    })
  }, [])

  const submitEdits = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!question || !draft || isSaving) {
      return
    }

    const parsedDifficulty = Number.parseInt(draft.difficulty, 10)
    if (!Number.isInteger(parsedDifficulty)) {
      setValidationErrors(['difficulty: Enter a valid integer.'])
      return
    }

    const normalizedQuestion = draft.question.trim()
    const normalizedMcqQuestion = draft.mcqQuestion.trim()
    const normalizedCompleteAnswer = draft.completeAnswer.trim()
    const normalizedSubject = draft.subject.trim()

    const normalizedMcqOptions: QuizOption[] = draft.mcqOptions.map((option, index) => ({
      option: option.trim(),
      is_correct: index === draft.correctOptionIndex,
    }))

    const validation = quizQuestionSchema.safeParse({
      question: normalizedQuestion,
      mcq_question: normalizedMcqQuestion,
      complete_answer: normalizedCompleteAnswer,
      mcq_options: normalizedMcqOptions,
      subject: normalizedSubject,
      difficulty: parsedDifficulty,
    })

    if (!validation.success) {
      setValidationErrors(formatQuestionValidationIssues(validation.error.issues))
      return
    }

    setValidationErrors([])

    await onSave(question.id, {
      question: normalizedQuestion,
      mcqQuestion: normalizedMcqQuestion,
      completeAnswer: normalizedCompleteAnswer,
      mcqOptions: normalizedMcqOptions,
      subject: normalizedSubject,
      difficulty: parsedDifficulty,
    })
  }, [draft, isSaving, onSave, question])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">Edit question</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Changes apply across every collection that references this question.
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close question editor" disabled={isSaving}>
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          {draft ? (
            <form className="mt-4 space-y-4" onSubmit={(event) => {
              void submitEdits(event)
            }}
            >
              <div className="grid gap-3">
                <label className="grid gap-2 text-sm font-medium">
                  Open question
                  <textarea
                    value={draft.question}
                    onChange={(event) => {
                      setDraft((currentDraft) => currentDraft
                        ? { ...currentDraft, question: event.target.value }
                        : currentDraft)
                    }}
                    rows={3}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    disabled={isSaving}
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  MCQ question
                  <textarea
                    value={draft.mcqQuestion}
                    onChange={(event) => {
                      setDraft((currentDraft) => currentDraft
                        ? { ...currentDraft, mcqQuestion: event.target.value }
                        : currentDraft)
                    }}
                    rows={3}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    disabled={isSaving}
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Complete answer
                  <textarea
                    value={draft.completeAnswer}
                    onChange={(event) => {
                      setDraft((currentDraft) => currentDraft
                        ? { ...currentDraft, completeAnswer: event.target.value }
                        : currentDraft)
                    }}
                    rows={4}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    disabled={isSaving}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    Subject
                    <input
                      value={draft.subject}
                      onChange={(event) => {
                        setDraft((currentDraft) => currentDraft
                          ? { ...currentDraft, subject: event.target.value }
                          : currentDraft)
                      }}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                      disabled={isSaving}
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-medium">
                    Difficulty
                    <input
                      type="number"
                      value={draft.difficulty}
                      onChange={(event) => {
                        setDraft((currentDraft) => currentDraft
                          ? { ...currentDraft, difficulty: event.target.value }
                          : currentDraft)
                      }}
                      min={-32768}
                      max={32767}
                      step={1}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                      disabled={isSaving}
                    />
                  </label>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">MCQ options</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select exactly one correct option.
                  </p>

                  <div className="mt-3 space-y-2">
                    {draft.mcqOptions.map((option, index) => (
                      <label key={index} className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="correct-option"
                          checked={draft.correctOptionIndex === index}
                          onChange={() => {
                            setDraft((currentDraft) => currentDraft
                              ? { ...currentDraft, correctOptionIndex: index }
                              : currentDraft)
                          }}
                          disabled={isSaving}
                        />
                        <input
                          value={option}
                          onChange={(event) => {
                            updateOptionValue(index, event.target.value)
                          }}
                          placeholder={`Option ${index + 1}`}
                          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
                          disabled={isSaving}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {validationErrors.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3" role="alert">
                  <p className="text-sm font-medium text-destructive">Please fix the following fields:</p>
                  <ul className="mt-2 space-y-1">
                    {validationErrors.map((errorMessage) => (
                      <li key={errorMessage} className="text-xs text-destructive">{errorMessage}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {saveError ? (
                <p className="text-sm text-destructive" role="alert">{saveError}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} className="gap-2">
                  {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save question
                </Button>
              </div>
            </form>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface OrphanProtectionDialogProps {
  resolution: OrphanResolutionState | null
  reassignableCollections: QuizCollectionSummary[]
  onClose: () => void
  onChangeStrategy: (strategy: 'delete' | 'reassign') => void
  onChangeTargetCollectionId: (collectionId: string | null) => void
  onConfirm: () => void
}

function OrphanProtectionDialog({
  resolution,
  reassignableCollections,
  onClose,
  onChangeStrategy,
  onChangeTargetCollectionId,
  onConfirm,
}: OrphanProtectionDialogProps) {
  const open = resolution !== null

  const title = resolution?.action.type === 'deleteCollection'
    ? 'Deleting this collection would orphan questions'
    : 'Removing this question would orphan it'

  const confirmLabel = resolution?.action.type === 'deleteCollection'
    ? resolution.strategy === 'delete'
      ? 'Delete collection and orphans'
      : 'Reassign and delete collection'
    : resolution?.strategy === 'delete'
      ? 'Remove and delete question'
      : 'Reassign and remove'

  const isReassignDisabled = reassignableCollections.length === 0
  const isConfirmDisabled = !resolution
    || resolution.isSubmitting
    || (resolution.strategy === 'reassign' && !resolution.targetCollectionId)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-2xl focus:outline-none"
          onPointerDownOutside={(event) => {
            event.preventDefault()
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Choose how to handle the affected question links.
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close orphan protection dialog">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          {resolution ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Affected question IDs ({resolution.orphanQuestionIds.length})
                </p>
                <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
                  <ul className="space-y-1">
                    {resolution.orphanQuestionIds.map((questionId) => (
                      <li key={questionId} className="font-mono text-xs">{questionId}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    onChangeStrategy('reassign')
                  }}
                  disabled={isReassignDisabled}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    resolution.strategy === 'reassign'
                      ? 'border-[#2F6868] bg-[#2F6868]/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    isReassignDisabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  Reassign to another collection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeStrategy('delete')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    resolution.strategy === 'delete'
                      ? 'border-destructive bg-destructive/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  Delete orphaned questions
                </button>
              </div>

              {resolution.strategy === 'reassign' ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Target collection</p>
                  <Select
                    value={resolution.targetCollectionId ?? undefined}
                    onValueChange={(value) => onChangeTargetCollectionId(value)}
                    disabled={isReassignDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a collection" />
                    </SelectTrigger>
                    <SelectContent>
                      {reassignableCollections.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isReassignDisabled ? (
                    <p className="text-xs text-muted-foreground">
                      No other collections are available. Choose delete to continue.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {resolution.error ? (
                <p className="text-sm text-destructive" role="alert">{resolution.error}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={resolution?.isSubmitting}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={isConfirmDisabled} className="gap-2">
              {resolution?.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function createQuestionEditDraft(question: QuizCollectionQuestion): QuestionEditDraft {
  const correctOptionIndex = question.mcqOptions.findIndex((option) => option.is_correct)

  return {
    question: question.question,
    mcqQuestion: question.mcqQuestion,
    completeAnswer: question.completeAnswer,
    subject: question.subject,
    difficulty: String(question.difficulty),
    mcqOptions: question.mcqOptions.map((option) => option.option),
    correctOptionIndex: correctOptionIndex >= 0 ? correctOptionIndex : 0,
  }
}

function formatQuestionValidationIssues(issues: ZodIssue[]): string[] {
  const visibleIssues = issues.slice(0, 8)
  const formatted = visibleIssues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'question'
    return `${path}: ${issue.message}`
  })

  const hiddenIssueCount = issues.length - visibleIssues.length
  if (hiddenIssueCount > 0) {
    formatted.push(`${hiddenIssueCount} additional issue(s) omitted.`)
  }

  return formatted
}

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  BookCopy,
  FolderOpen,
  Loader2,
  LogOut,
  RefreshCw,
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
import type { QuizCollectionQuestion, QuizCollectionSummary } from '@/features/quiz/model'
import {
  type OrphanResolutionState,
  useCollectionDetailViewModel,
} from '@/features/quiz/view-model'
import { cn } from '@/lib/utils'

export function CollectionDetailPage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const collectionId = typeof params.id === 'string' ? params.id.trim() : ''

  const { accessToken, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const {
    collection,
    questions,
    reassignableCollections,
    isLoadingDetail,
    detailLoadError,
    isSavingMetadata,
    metadataSaveError,
    isDeletingCollection,
    deleteCollectionError,
    removingQuestionId,
    removeQuestionError,
    orphanResolution,
    refreshDetail,
    saveMetadata,
    deleteCollection,
    removeQuestion,
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

  useEffect(() => {
    if (!collection) {
      setNameDraft('')
      setDescriptionDraft('')
      return
    }

    setNameDraft(collection.name)
    setDescriptionDraft(collection.description ?? '')
  }, [collection])

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
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">Questions</h2>
                  <p className="text-muted-foreground text-sm">
                    {questions.length} question{questions.length === 1 ? '' : 's'}
                  </p>
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
                        isRemoving={removingQuestionId === question.id}
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
  isRemoving: boolean
  onRemove: () => void
}

function QuestionRow({ question, isRemoving, onRemove }: QuestionRowProps) {
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

        <Button
          variant="outline"
          size="sm"
          onClick={onRemove}
          disabled={isRemoving}
          className="shrink-0 gap-2 text-destructive hover:text-destructive"
        >
          {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Remove
        </Button>
      </div>
    </article>
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

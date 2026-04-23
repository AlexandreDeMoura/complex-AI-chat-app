import { type FormEvent, useCallback, useState } from 'react'
import {
  ArrowLeft,
  BookCopy,
  FolderKanban,
  Loader2,
  LogOut,
  Plus,
  Upload,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/view-model'
import type { QuizCollectionSummary } from '@/features/quiz/model'
import { useCollectionsListViewModel } from '@/features/quiz/view-model'

export function CollectionsListPage() {
  const navigate = useNavigate()
  const { accessToken, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const {
    collections,
    isLoadingCollections,
    collectionsLoadError,
    isCreatingCollection,
    createCollectionError,
    refreshCollections,
    createCollection,
  } = useCollectionsListViewModel({ accessToken })

  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionDescription, setNewCollectionDescription] = useState('')
  const [localCreateError, setLocalCreateError] = useState<string | null>(null)

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

  const handleCreateCollection = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = newCollectionName.trim()
    if (!trimmedName) {
      setLocalCreateError('Collection name is required.')
      return
    }

    setLocalCreateError(null)
    const wasCreated = await createCollection({
      name: trimmedName,
      description: newCollectionDescription,
    })

    if (!wasCreated) {
      return
    }

    setNewCollectionName('')
    setNewCollectionDescription('')
  }, [createCollection, newCollectionDescription, newCollectionName])

  const createErrorMessage = localCreateError ?? createCollectionError

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-[#2F6868]/10 p-1.5 text-[#2F6868]">
              <FolderKanban className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">Collections</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="gap-2">
                <ArrowLeft className="size-4" />
                Back to chat
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/quiz" className="gap-2">
                <Upload className="size-4" />
                Import questions
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
          <section className="rounded-2xl border border-border bg-card p-6">
            <h1 className="text-xl font-semibold tracking-tight">Create a collection</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Add a custom study group for your existing and future quiz questions.
            </p>

            <form className="mt-4 grid gap-3 md:grid-cols-[1.2fr_2fr_auto]" onSubmit={(event) => {
              void handleCreateCollection(event)
            }}
            >
              <input
                value={newCollectionName}
                onChange={(event) => setNewCollectionName(event.target.value)}
                placeholder="Collection name"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                disabled={isCreatingCollection}
                maxLength={120}
              />
              <input
                value={newCollectionDescription}
                onChange={(event) => setNewCollectionDescription(event.target.value)}
                placeholder="Description (optional)"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                disabled={isCreatingCollection}
                maxLength={300}
              />
              <Button type="submit" disabled={isCreatingCollection} className="gap-2">
                {isCreatingCollection ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                New collection
              </Button>
            </form>

            {createErrorMessage ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {createErrorMessage}
              </p>
            ) : null}
          </section>

          {collectionsLoadError ? (
            <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">{collectionsLoadError}</p>
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    void refreshCollections()
                  }}
                >
                  Retry
                </Button>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Your collections</h2>
              <p className="text-muted-foreground text-sm">
                {collections.length} total
              </p>
            </div>

            {isLoadingCollections && collections.length === 0 ? (
              <CollectionsLoadingState />
            ) : collections.length === 0 ? (
              <CollectionsEmptyState />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function CollectionsLoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-[126px] w-full rounded-xl"
        />
      ))}
    </div>
  )
}

function CollectionsEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <BookCopy className="text-muted-foreground mx-auto mb-3 size-5" />
      <p className="text-sm font-medium">No collections yet.</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Create your first collection above or import questions from a quiz JSON file.
      </p>
    </div>
  )
}

interface CollectionCardProps {
  collection: QuizCollectionSummary
}

function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-5">{collection.name}</h3>
        <span className="rounded-full bg-[#2F6868]/10 px-2 py-1 text-xs font-medium text-[#2F6868]">
          {collection.questionCount} question{collection.questionCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 line-clamp-3 text-xs leading-5">
        {collection.description || 'No description yet.'}
      </p>
    </article>
  )
}

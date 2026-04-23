import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createQuizCollection,
  listQuizCollections,
  QuizApiError,
} from '@/features/quiz/data'
import type { QuizCollectionSummary } from '@/features/quiz/model'

interface UseCollectionsListViewModelOptions {
  accessToken: string | null
}

interface CreateCollectionInput {
  name: string
  description?: string | null
}

export interface CollectionsListViewModel {
  collections: QuizCollectionSummary[]
  isLoadingCollections: boolean
  collectionsLoadError: string | null
  isCreatingCollection: boolean
  createCollectionError: string | null
  refreshCollections: () => Promise<void>
  createCollection: (input: CreateCollectionInput) => Promise<boolean>
}

function formatQuizApiErrorDetails(details: unknown): string[] {
  if (!Array.isArray(details)) {
    return []
  }

  return details
    .map((detail) => {
      if (!detail || typeof detail !== 'object') {
        return null
      }

      const detailRecord = detail as Record<string, unknown>
      const detailMessage = detailRecord.message
      const message = typeof detailMessage === 'string'
        ? detailMessage.trim()
        : ''

      return message || null
    })
    .filter((message): message is string => Boolean(message))
}

function formatQuizApiError(error: QuizApiError): string {
  const detailMessages = formatQuizApiErrorDetails(error.details)
  if (detailMessages.length === 0) {
    return error.message
  }

  return [error.message, ...detailMessages].join(' ')
}

export function useCollectionsListViewModel({
  accessToken,
}: UseCollectionsListViewModelOptions): CollectionsListViewModel {
  const [collections, setCollections] = useState<QuizCollectionSummary[]>([])
  const [isLoadingCollections, setIsLoadingCollections] = useState(false)
  const [collectionsLoadError, setCollectionsLoadError] = useState<string | null>(null)
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [createCollectionError, setCreateCollectionError] = useState<string | null>(null)

  const loadCollections = useCallback(async () => {
    if (!accessToken) {
      setCollections([])
      setCollectionsLoadError('You need an active session to view collections.')
      setIsLoadingCollections(false)
      return
    }

    setIsLoadingCollections(true)
    setCollectionsLoadError(null)

    try {
      const nextCollections = await listQuizCollections(accessToken)
      setCollections(nextCollections)
    } catch (error) {
      if (error instanceof QuizApiError) {
        const errorMessage = error.statusCode === 401
          ? 'Your session expired. Please sign in again.'
          : formatQuizApiError(error)
        setCollectionsLoadError(errorMessage)
      } else {
        setCollectionsLoadError('Unable to load collections right now.')
      }
    } finally {
      setIsLoadingCollections(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadCollections()
  }, [loadCollections])

  const createCollection = useCallback(async ({
    name,
    description,
  }: CreateCollectionInput): Promise<boolean> => {
    if (!accessToken) {
      setCreateCollectionError('You need an active session to create a collection.')
      return false
    }

    setIsCreatingCollection(true)
    setCreateCollectionError(null)

    try {
      const createdCollection = await createQuizCollection({
        accessToken,
        name,
        description,
      })

      setCollections((previousCollections) => [...previousCollections, createdCollection])
      return true
    } catch (error) {
      if (error instanceof QuizApiError) {
        const errorMessage = error.statusCode === 401
          ? 'Your session expired. Please sign in again.'
          : formatQuizApiError(error)
        setCreateCollectionError(errorMessage)
      } else {
        setCreateCollectionError('Unable to create this collection right now.')
      }

      return false
    } finally {
      setIsCreatingCollection(false)
    }
  }, [accessToken])

  return useMemo<CollectionsListViewModel>(() => ({
    collections,
    isLoadingCollections,
    collectionsLoadError,
    isCreatingCollection,
    createCollectionError,
    refreshCollections: loadCollections,
    createCollection,
  }), [
    collections,
    createCollection,
    createCollectionError,
    collectionsLoadError,
    isCreatingCollection,
    isLoadingCollections,
    loadCollections,
  ])
}

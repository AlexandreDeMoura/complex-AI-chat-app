import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteQuizCollection,
  extractOrphanQuestionIdsFromDetails,
  listQuizCollectionQuestions,
  listQuizCollections,
  QuizApiError,
  removeQuizQuestionFromCollection,
  updateQuizCollection,
} from '@/features/quiz/data'
import type {
  OrphanStrategy,
  QuizCollectionQuestion,
  QuizCollectionSummary,
} from '@/features/quiz/model'

const QUIZ_AUTH_ERROR_MESSAGE = 'Your session expired. Please sign in again.'

interface UseCollectionDetailViewModelOptions {
  accessToken: string | null
  collectionId: string
}

type OrphanResolutionAction =
  | { type: 'deleteCollection' }
  | { type: 'removeQuestion'; questionId: string }

export interface OrphanResolutionState {
  action: OrphanResolutionAction
  orphanQuestionIds: string[]
  strategy: OrphanStrategy
  targetCollectionId: string | null
  error: string | null
  isSubmitting: boolean
}

export interface CollectionDetailViewModel {
  collection: QuizCollectionSummary | null
  questions: QuizCollectionQuestion[]
  reassignableCollections: QuizCollectionSummary[]
  isLoadingDetail: boolean
  detailLoadError: string | null
  isSavingMetadata: boolean
  metadataSaveError: string | null
  isDeletingCollection: boolean
  deleteCollectionError: string | null
  removingQuestionId: string | null
  removeQuestionError: string | null
  orphanResolution: OrphanResolutionState | null
  refreshDetail: () => Promise<void>
  saveMetadata: (input: { name: string; description: string | null }) => Promise<boolean>
  deleteCollection: () => Promise<boolean>
  removeQuestion: (questionId: string) => Promise<boolean>
  dismissOrphanResolution: () => void
  setOrphanResolutionStrategy: (strategy: OrphanStrategy) => void
  setOrphanResolutionTargetCollectionId: (collectionId: string | null) => void
  confirmOrphanResolution: () => Promise<boolean>
}

function formatQuizApiErrorDetails(details: unknown): string[] {
  if (Array.isArray(details)) {
    return details
      .map((detail) => {
        if (!detail || typeof detail !== 'object') {
          return null
        }

        const detailMessage = (detail as Record<string, unknown>).message
        return typeof detailMessage === 'string' && detailMessage.trim()
          ? detailMessage.trim()
          : null
      })
      .filter((message): message is string => Boolean(message))
  }

  if (!details || typeof details !== 'object') {
    return []
  }

  return Object.entries(details as Record<string, unknown>)
    .map(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return null
      }

      const serialized = typeof value === 'string' ? value.trim() : JSON.stringify(value)
      return serialized ? `${key}: ${serialized}` : null
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

function decrementCollectionCount(collection: QuizCollectionSummary): QuizCollectionSummary {
  return {
    ...collection,
    questionCount: Math.max(collection.questionCount - 1, 0),
  }
}

export function useCollectionDetailViewModel({
  accessToken,
  collectionId,
}: UseCollectionDetailViewModelOptions): CollectionDetailViewModel {
  const [allCollections, setAllCollections] = useState<QuizCollectionSummary[]>([])
  const [collection, setCollection] = useState<QuizCollectionSummary | null>(null)
  const [questions, setQuestions] = useState<QuizCollectionQuestion[]>([])

  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null)

  const [isSavingMetadata, setIsSavingMetadata] = useState(false)
  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null)

  const [isDeletingCollection, setIsDeletingCollection] = useState(false)
  const [deleteCollectionError, setDeleteCollectionError] = useState<string | null>(null)

  const [removingQuestionId, setRemovingQuestionId] = useState<string | null>(null)
  const [removeQuestionError, setRemoveQuestionError] = useState<string | null>(null)

  const [orphanResolution, setOrphanResolution] = useState<OrphanResolutionState | null>(null)

  const reassignableCollections = useMemo(
    () => allCollections.filter((item) => item.id !== collectionId),
    [allCollections, collectionId],
  )

  const openOrphanResolution = useCallback((
    action: OrphanResolutionAction,
    orphanQuestionIds: string[],
  ) => {
    if (orphanQuestionIds.length === 0) {
      return
    }

    const defaultTargetCollectionId = reassignableCollections[0]?.id ?? null
    const defaultStrategy: OrphanStrategy = defaultTargetCollectionId ? 'reassign' : 'delete'

    setOrphanResolution({
      action,
      orphanQuestionIds,
      strategy: defaultStrategy,
      targetCollectionId: defaultTargetCollectionId,
      error: null,
      isSubmitting: false,
    })
  }, [reassignableCollections])

  const refreshDetail = useCallback(async () => {
    if (!accessToken) {
      setAllCollections([])
      setCollection(null)
      setQuestions([])
      setDetailLoadError('You need an active session to view collections.')
      setIsLoadingDetail(false)
      return
    }

    setIsLoadingDetail(true)
    setDetailLoadError(null)

    try {
      const [nextCollections, nextQuestions] = await Promise.all([
        listQuizCollections(accessToken),
        listQuizCollectionQuestions({ accessToken, collectionId }),
      ])

      const nextCollection = nextCollections.find((item) => item.id === collectionId) ?? null
      if (!nextCollection) {
        setAllCollections(nextCollections)
        setCollection(null)
        setQuestions([])
        setDetailLoadError('Collection not found.')
        return
      }

      setAllCollections(nextCollections)
      setCollection({
        ...nextCollection,
        questionCount: nextQuestions.length,
      })
      setQuestions(nextQuestions)
    } catch (error) {
      setCollection(null)
      setQuestions([])

      if (error instanceof QuizApiError) {
        const errorMessage = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : formatQuizApiError(error)
        setDetailLoadError(errorMessage)
      } else {
        setDetailLoadError('Unable to load this collection right now.')
      }
    } finally {
      setIsLoadingDetail(false)
    }
  }, [accessToken, collectionId])

  useEffect(() => {
    void refreshDetail()
  }, [refreshDetail])

  const saveMetadata = useCallback(async ({
    name,
    description,
  }: {
    name: string
    description: string | null
  }): Promise<boolean> => {
    if (!accessToken) {
      setMetadataSaveError('You need an active session to update collection details.')
      return false
    }

    if (!collection) {
      setMetadataSaveError('Collection not found.')
      return false
    }

    setIsSavingMetadata(true)
    setMetadataSaveError(null)

    try {
      const updatedCollection = await updateQuizCollection({
        accessToken,
        collectionId,
        name,
        description,
      })

      const mergedCollection: QuizCollectionSummary = {
        ...collection,
        ...updatedCollection,
        questionCount: collection.questionCount,
      }

      setCollection(mergedCollection)
      setAllCollections((previousCollections) => previousCollections.map((item) => {
        if (item.id !== collectionId) {
          return item
        }

        return {
          ...item,
          name: mergedCollection.name,
          description: mergedCollection.description,
          updatedAt: mergedCollection.updatedAt,
        }
      }))
      return true
    } catch (error) {
      if (error instanceof QuizApiError) {
        const errorMessage = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : formatQuizApiError(error)
        setMetadataSaveError(errorMessage)
      } else {
        setMetadataSaveError('Unable to update this collection right now.')
      }
      return false
    } finally {
      setIsSavingMetadata(false)
    }
  }, [accessToken, collection, collectionId])

  const deleteCollection = useCallback(async (): Promise<boolean> => {
    if (!accessToken) {
      setDeleteCollectionError('You need an active session to delete collections.')
      return false
    }

    setIsDeletingCollection(true)
    setDeleteCollectionError(null)

    try {
      await deleteQuizCollection({
        accessToken,
        collectionId,
      })

      return true
    } catch (error) {
      if (error instanceof QuizApiError) {
        if (error.statusCode === 409) {
          const orphanQuestionIds = extractOrphanQuestionIdsFromDetails(error.details)
          if (orphanQuestionIds.length > 0) {
            openOrphanResolution({ type: 'deleteCollection' }, orphanQuestionIds)
            return false
          }
        }

        const errorMessage = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : formatQuizApiError(error)
        setDeleteCollectionError(errorMessage)
      } else {
        setDeleteCollectionError('Unable to delete this collection right now.')
      }

      return false
    } finally {
      setIsDeletingCollection(false)
    }
  }, [accessToken, collectionId, openOrphanResolution])

  const removeQuestion = useCallback(async (questionId: string): Promise<boolean> => {
    if (!accessToken) {
      setRemoveQuestionError('You need an active session to remove questions.')
      return false
    }

    const normalizedQuestionId = questionId.trim()
    if (!normalizedQuestionId) {
      setRemoveQuestionError('Question id is required.')
      return false
    }

    setRemovingQuestionId(normalizedQuestionId)
    setRemoveQuestionError(null)

    try {
      await removeQuizQuestionFromCollection({
        accessToken,
        collectionId,
        questionId: normalizedQuestionId,
      })

      setQuestions((previousQuestions) =>
        previousQuestions.filter((question) => question.id !== normalizedQuestionId))

      setCollection((currentCollection) =>
        currentCollection ? decrementCollectionCount(currentCollection) : currentCollection)

      setAllCollections((previousCollections) => previousCollections.map((item) =>
        item.id === collectionId ? decrementCollectionCount(item) : item))

      return true
    } catch (error) {
      if (error instanceof QuizApiError) {
        if (error.statusCode === 409) {
          const orphanQuestionIds = extractOrphanQuestionIdsFromDetails(error.details)
          if (orphanQuestionIds.length > 0) {
            openOrphanResolution(
              { type: 'removeQuestion', questionId: normalizedQuestionId },
              orphanQuestionIds,
            )
            return false
          }
        }

        const errorMessage = error.statusCode === 401
          ? QUIZ_AUTH_ERROR_MESSAGE
          : formatQuizApiError(error)
        setRemoveQuestionError(errorMessage)
      } else {
        setRemoveQuestionError('Unable to remove this question right now.')
      }

      return false
    } finally {
      setRemovingQuestionId((currentRemovingQuestionId) =>
        currentRemovingQuestionId === normalizedQuestionId ? null : currentRemovingQuestionId)
    }
  }, [accessToken, collectionId, openOrphanResolution])

  const dismissOrphanResolution = useCallback(() => {
    setOrphanResolution(null)
  }, [])

  const setOrphanResolutionStrategy = useCallback((strategy: OrphanStrategy) => {
    setOrphanResolution((currentResolution) => {
      if (!currentResolution || currentResolution.strategy === strategy) {
        return currentResolution
      }

      return {
        ...currentResolution,
        strategy,
        targetCollectionId:
          strategy === 'reassign'
            ? currentResolution.targetCollectionId ?? reassignableCollections[0]?.id ?? null
            : null,
        error: null,
      }
    })
  }, [reassignableCollections])

  const setOrphanResolutionTargetCollectionId = useCallback((targetCollectionId: string | null) => {
    setOrphanResolution((currentResolution) => {
      if (!currentResolution) {
        return currentResolution
      }

      return {
        ...currentResolution,
        targetCollectionId,
        error: null,
      }
    })
  }, [])

  const confirmOrphanResolution = useCallback(async (): Promise<boolean> => {
    if (!accessToken) {
      setOrphanResolution((currentResolution) => currentResolution
        ? {
          ...currentResolution,
          error: 'You need an active session to continue.',
          isSubmitting: false,
        }
        : currentResolution)
      return false
    }

    if (!orphanResolution) {
      return false
    }

    if (orphanResolution.strategy === 'reassign') {
      const targetCollectionId = orphanResolution.targetCollectionId?.trim() ?? ''
      if (!targetCollectionId) {
        setOrphanResolution((currentResolution) => currentResolution
          ? {
            ...currentResolution,
            error: 'Select a target collection before reassigning orphaned questions.',
            isSubmitting: false,
          }
          : currentResolution)
        return false
      }

      if (targetCollectionId === collectionId) {
        setOrphanResolution((currentResolution) => currentResolution
          ? {
            ...currentResolution,
            error: 'Select a different collection as the reassign target.',
            isSubmitting: false,
          }
          : currentResolution)
        return false
      }
    }

    setOrphanResolution((currentResolution) => currentResolution
      ? {
        ...currentResolution,
        isSubmitting: true,
        error: null,
      }
      : currentResolution)

    const targetCollectionId = orphanResolution.targetCollectionId ?? undefined

    try {
      if (orphanResolution.action.type === 'deleteCollection') {
        await deleteQuizCollection({
          accessToken,
          collectionId,
          orphanStrategy: orphanResolution.strategy,
          targetCollectionId,
        })

        setOrphanResolution(null)
        return true
      }

      const resolvedQuestionId = orphanResolution.action.questionId

      await removeQuizQuestionFromCollection({
        accessToken,
        collectionId,
        questionId: resolvedQuestionId,
        orphanStrategy: orphanResolution.strategy,
        targetCollectionId,
      })

      setQuestions((previousQuestions) =>
        previousQuestions.filter((question) => question.id !== resolvedQuestionId))

      setCollection((currentCollection) =>
        currentCollection ? decrementCollectionCount(currentCollection) : currentCollection)

      setAllCollections((previousCollections) => previousCollections.map((item) =>
        item.id === collectionId ? decrementCollectionCount(item) : item))

      setOrphanResolution(null)
      return true
    } catch (error) {
      if (error instanceof QuizApiError) {
        setOrphanResolution((currentResolution) => {
          if (!currentResolution) {
            return currentResolution
          }

          return {
            ...currentResolution,
            isSubmitting: false,
            error: error.statusCode === 401
              ? QUIZ_AUTH_ERROR_MESSAGE
              : formatQuizApiError(error),
          }
        })
      } else {
        setOrphanResolution((currentResolution) => {
          if (!currentResolution) {
            return currentResolution
          }

          return {
            ...currentResolution,
            isSubmitting: false,
            error: 'Unable to apply orphan handling right now. Try again.',
          }
        })
      }

      return false
    }
  }, [accessToken, collectionId, orphanResolution])

  return useMemo<CollectionDetailViewModel>(() => ({
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
  }), [
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
  ])
}

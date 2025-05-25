import { useLoaderStore } from '../store/useLoaderStore.ts'
import { useErrorNotification } from './useErrorNotification.ts'
import { useLoading } from './useLoading.ts'
import type { ApiError } from '../libs/httpErrorHandler.ts'

interface UseDataFetchingParams {
  isPending: boolean
  isError: boolean
  error: Error | ApiError | null
  errorMessage?: string
}

export const useDataFetching = ({
  isPending,
  isError,
  error,
  errorMessage = 'Une erreur est survenue',
}: UseDataFetchingParams) => {
  const { setIsLoading } = useLoaderStore()
  useErrorNotification(isError, error, errorMessage)
  useLoading(isPending, setIsLoading)
}

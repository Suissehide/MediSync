import { useEffect } from 'react'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useToast } from './useToast.ts'
import { type ApiError, isApiError } from '../libs/httpErrorHandler.ts'

export const useErrorNotification = (
  isError: boolean,
  error: Error | ApiError | null,
  fallbackMessage: string,
) => {
  const { toast } = useToast()

  useEffect(() => {
    if (isError && error) {
      const errorTitle = isApiError(error) ? error.title : 'Erreur inconnue'
      const message = error.message
      const title = fallbackMessage || errorTitle
      toast({
        title,
        message,
        severity: TOAST_SEVERITY.ERROR,
      })
    }
  }, [isError, error, fallbackMessage, toast])
}

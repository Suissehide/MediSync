import { useEffect } from 'react'

export const useLoading = (
  isLoading: boolean,
  startLoading: () => void,
  stopLoading: () => void,
) => {
  useEffect(() => {
    if (!isLoading) {
      return
    }

    startLoading()

    return () => {
      stopLoading()
    }
  }, [isLoading, startLoading, stopLoading])
}

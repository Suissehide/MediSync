import { useCallback } from 'react'

import { type ToasterToast, useToastStore } from '../store/useToastStore'

type Toast = Omit<ToasterToast, 'id'>

export function useToast() {
  const toasts = useToastStore((state) => state.toasts)
  const addToast = useToastStore((state) => state.addToast)
  const removeToast = useToastStore((state) => state.removeToast)

  const toast = useCallback(
    (props: Toast) => {
      const id = addToast(props)
      return {
        id,
        dismiss: () => removeToast(id),
      }
    },
    [addToast, removeToast],
  )

  return { toasts, toast }
}

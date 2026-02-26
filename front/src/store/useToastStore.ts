import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type React from 'react'

import type { ToastActionElement, ToastProps } from '../components/ui/toast.tsx'
import type { ToastSeverity } from '../constants/ui.constant.ts'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

export type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  message?: React.ReactNode
  severity?: ToastSeverity
  action?: ToastActionElement
  duration?: number
}

type ToastState = {
  toasts: ToasterToast[]
  addToast: (toast: Omit<ToasterToast, 'id'>) => string
  removeToast: (id?: string) => void
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_VALUE
  return count.toString()
}

export const useToastStore = create<ToastState>()(
  devtools(
    (set) => ({
      toasts: [],

      addToast: (toastData) => {
        const id = genId()

        const newToast: ToasterToast = {
          ...toastData,
          id,
          duration: toastData.duration ?? TOAST_REMOVE_DELAY,
        }

        set((state) => ({
          toasts: [newToast, ...state.toasts].slice(0, TOAST_LIMIT),
        }))

        return id
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: id ? state.toasts.filter((t) => t.id !== id) : [],
        }))
      },
    }),
    {
      name: 'toast-store',
    },
  ),
)

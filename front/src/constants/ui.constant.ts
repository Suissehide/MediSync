import type { LucideIcon } from 'lucide-react'

export const TOAST_SEVERITY = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
}

export type ToastSeverity = (typeof TOAST_SEVERITY)[keyof typeof TOAST_SEVERITY]

export type MenuItem = {
  id: string
  label: string
  icon?: LucideIcon
}

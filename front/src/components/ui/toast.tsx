import { Cross2Icon } from '@radix-ui/react-icons'
import { cva, type VariantProps } from 'class-variance-authority'
import React from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../libs/utils.ts'

const toastVariants = cva(
  'relative group flex flex-col w-full overflow-hidden rounded-lg bg-card border shadow-lg',
  {
    variants: {
      variant: {
        default: 'border-border',
        destructive:
          'border-red-500/30 bg-[linear-gradient(to_right,_rgba(239,68,68,0.12)_0%,_transparent_50%)]',
        warning:
          'border-yellow-500/30 bg-[linear-gradient(to_right,_rgba(234,179,8,0.12)_0%,_transparent_50%)]',
        info: 'border-blue-500/30 bg-[linear-gradient(to_right,_rgba(59,130,246,0.12)_0%,_transparent_50%)]',
        success:
          'border-emerald-500/30 bg-[linear-gradient(to_right,_rgba(16,185,129,0.12)_0%,_transparent_50%)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const toastProgressVariants = cva('h-full w-full transition-none', {
  variants: {
    variant: {
      default: 'bg-primary',
      destructive: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500',
      success: 'bg-emerald-500',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  return createPortal(<>{children}</>, document.body)
}

const Toast = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  />
))
Toast.displayName = 'Toast'

const ToastClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'shrink-0 cursor-pointer rounded-md p-1 text-text-sidebar transition-colors hover:text-text focus:outline-none',
      className,
    )}
    {...props}
  >
    <Cross2Icon className="h-4 w-4" />
  </button>
))
ToastClose.displayName = 'ToastClose'

const ToastTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-left text-sm leading-tight text-text-light', className)}
    {...props}
  />
))
ToastTitle.displayName = 'ToastTitle'

const ToastDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-xs text-text-light mt-0.5', className)}
    {...props}
  />
))
ToastDescription.displayName = 'ToastDescription'

type ToastProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof toastVariants>
type ToastActionElement = React.ReactElement

export {
  type ToastProps,
  type ToastActionElement,
  toastProgressVariants,
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
}

import { cva } from 'class-variance-authority'
import { Check } from 'lucide-react'
import React from 'react'

import { cn } from '../../libs/utils.ts'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}
interface TextAreaProps
  extends React.InputHTMLAttributes<HTMLTextAreaElement> {}
interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const inputVariants = cva(
  'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 mb-0 text-sm transition-colors ' +
    'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
)

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, iconLeft, iconRight, ...props }, ref) => {
    if (!iconLeft && !iconRight) {
      return (
        <input
          type={type}
          className={cn(inputVariants(), className)}
          ref={ref}
          {...props}
        />
      )
    }

    return (
      <div className="relative">
        {iconLeft && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light pointer-events-none flex items-center">
            {iconLeft}
          </span>
        )}
        <input
          type={type}
          className={cn(
            inputVariants(),
            iconLeft && 'pl-9',
            iconRight && 'pr-9',
            className,
          )}
          ref={ref}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light pointer-events-none flex items-center">
            {iconRight}
          </span>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        rows={4}
        className={cn(inputVariants(), 'min-h-[75px]', className)}
        ref={ref}
        {...props}
      />
    )
  },
)
TextArea.displayName = 'TextArea'

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <label className="flex items-center mb-0 w-fit cursor-pointer select-none">
        <input type="checkbox" ref={ref} className="peer sr-only" {...props} />
        <div
          className={cn(
            'h-5 w-5 flex items-center justify-center rounded border border-border bg-background  transition-colors',
            ' peer-checked:[&>svg]:opacity-100',
            className,
          )}
          aria-hidden="true"
        >
          <Check className="h-5 w-5 text-primary opacity-0 transition-opacity pointer-events-none" />
        </div>
      </label>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export { Input, TextArea, Checkbox }

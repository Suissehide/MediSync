import React from 'react'
import { cn } from '../../libs/utils.ts'
import { cva } from 'class-variance-authority'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const inputVariants = cva(
  'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 mb-0 text-sm transition-colors ' +
    'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
)

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants(), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }

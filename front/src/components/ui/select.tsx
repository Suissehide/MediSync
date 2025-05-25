import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Select = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return <></>
  },
)
Select.displayName = 'Select'

export { Select }

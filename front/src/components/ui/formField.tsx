import type { ReactNode } from 'react'

import { cn } from '../../libs/utils.ts'

type FormFieldProps = {
  children: ReactNode
  className?: string
}

// Meme empilement label / controle que les champs de `hooks/formConfig.tsx` :
// un champ affiche a la main s'aligne sur un champ du formulaire. `cn` laisse
// `className` reprendre la main (`flex-row`, `gap-2`...).
const FormField = ({ children, className }: FormFieldProps) => {
  return <div className={cn('flex flex-col gap-1', className)}>{children}</div>
}

export { FormField }

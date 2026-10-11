import { ArrowDown, ArrowUp, Undo2 } from 'lucide-react'

import { Button, type ButtonProps } from '@/components/ui/button.tsx'
import { cn } from '@/libs/utils.ts'

type IconButtonProps = Omit<
  ButtonProps,
  'variant' | 'size' | 'aria-label' | 'title'
> & {
  label: string
  danger?: boolean
}

// Bouton icône 32×32 : le libellé sert à la fois d'aria-label et de title.
export function IconButton({ label, danger, ...props }: IconButtonProps) {
  return (
    <Button
      variant={danger ? 'icon-danger' : 'icon'}
      size="icon-md"
      aria-label={label}
      title={label}
      {...props}
    />
  )
}

export function ActionSeparator() {
  return <span aria-hidden="true" className="w-px h-5 bg-border mx-1.5" />
}

export function MoveButtons({
  upLabel = 'Monter',
  downLabel = 'Descendre',
  upDisabled,
  downDisabled,
  onUp,
  onDown,
}: {
  upLabel?: string
  downLabel?: string
  upDisabled: boolean
  downDisabled: boolean
  onUp: () => void
  onDown: () => void
}) {
  return (
    <>
      <IconButton label={upLabel} disabled={upDisabled} onClick={onUp}>
        <ArrowUp className="w-4 h-4" />
      </IconButton>
      <IconButton label={downLabel} disabled={downDisabled} onClick={onDown}>
        <ArrowDown className="w-4 h-4" />
      </IconButton>
    </>
  )
}

export function RestoreButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-8 bg-white text-[13px] text-foreground', className)}
      {...props}
    >
      <Undo2 className="w-3.5 h-3.5" />
      Restaurer
    </Button>
  )
}

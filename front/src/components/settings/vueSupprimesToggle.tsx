import type { ReactNode } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'

interface VueSupprimesToggleProps {
  showDeleted: boolean
  onShowDeletedChange: (showDeleted: boolean) => void
  feminin?: boolean
  label?: string
  className?: string
  children?: ReactNode
}

// « Supprimés » est l'autre vue, pas une option ajoutée : un segmenté, pas un interrupteur.
export function VueSupprimesToggle({
  showDeleted,
  onShowDeletedChange,
  feminin = false,
  label = 'Éléments à afficher',
  className,
  children,
}: VueSupprimesToggleProps) {
  const e = feminin ? 'e' : ''
  return (
    <ToggleGroup
      aria-label={label}
      className={className}
      value={showDeleted ? 'supprimes' : 'actifs'}
      // Radix laisse désélectionner l'item actif : on ignore la valeur vide.
      onValueChange={(valeur) =>
        valeur && onShowDeletedChange(valeur === 'supprimes')
      }
    >
      <ToggleGroupItem value="actifs">
        {feminin ? 'Actives' : 'Actifs'}
      </ToggleGroupItem>
      <ToggleGroupItem value="supprimes">
        Supprimé{e}s{children}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

import { Slot } from '@radix-ui/react-slot'
import type React from 'react'

import { getContrastTextColor, hexToRGBA } from '../../libs/color.ts'
import { cn } from '../../libs/utils.ts'

// L'etiquette des tableaux et des listes : une seule forme (coins, taille, marges) pour toute
// l'application — roles, statuts, types, parcours, soignants et patients de l'agenda. Seule la
// couleur varie, par un `ton` nomme ou par la `couleur` propre a l'objet (un parcours).
export type TonEtiquette =
  | 'primaire'
  | 'succes'
  | 'neutre'
  | 'danger'
  | 'alerte'
  | 'temporaire'

const TONS: Record<TonEtiquette, string> = {
  primaire: 'bg-primary/10 text-primary border-primary/20',
  succes: 'bg-green-50 text-green-700 border-green-200',
  neutre: 'bg-gray-100 text-gray-600 border-gray-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  alerte: 'bg-amber-100 text-amber-700 border-amber-200',
  temporaire: 'bg-secondary-light text-secondary-dark border-secondary-dark/20',
}

type EtiquetteProps = React.HTMLAttributes<HTMLElement> & {
  ton?: TonEtiquette
  // Couleur de l'objet (hexadecimale), prioritaire sur le ton : les parcours ont la leur.
  couleur?: string
  // Rend l'enfant (un lien, un bouton) avec l'apparence de l'etiquette.
  asChild?: boolean
}

export function Etiquette({
  ton = 'primaire',
  couleur,
  asChild = false,
  className,
  style,
  ...props
}: EtiquetteProps) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp
      className={cn(
        'inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-4',
        couleur === undefined && TONS[ton],
        className,
      )}
      style={
        couleur === undefined
          ? style
          : {
              backgroundColor: hexToRGBA(couleur, 0.4),
              color: getContrastTextColor(couleur),
              borderColor: hexToRGBA(couleur, 0.8),
              ...style,
            }
      }
      {...props}
    />
  )
}

// Statut d'un compte ou d'un etablissement : actif, desactive, ou invite sans s'etre encore connecte.
export const EtiquetteStatut = ({
  deactivatedAt,
  invitationPending = false,
}: {
  deactivatedAt: string | null
  invitationPending?: boolean
}) => {
  if (deactivatedAt !== null) {
    return <Etiquette ton="neutre">Désactivé</Etiquette>
  }
  if (invitationPending) {
    return <Etiquette ton="alerte">Invitation en attente</Etiquette>
  }
  return <Etiquette ton="succes">Actif</Etiquette>
}

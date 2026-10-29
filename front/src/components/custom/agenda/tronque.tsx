import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../libs/utils.ts'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '../../ui/tooltip.tsx'

type TronqueProps = {
  // Le texte entier, celui de l'info-bulle.
  texte: string
  className?: string
  // Rendu à la place du texte brut (des pastilles, par exemple).
  children?: ReactNode
}

/**
 * Contenu coupé par une colonne à largeur figée, rendu entier au survol.
 * L'info-bulle n'apparaît que si ça déborde vraiment, et sans délai —
 * `title` attend une seconde et ne se règle pas.
 */
export const Tronque = ({ texte, className, children }: TronqueProps) => {
  const [coupe, setCoupe] = useState(false)
  const mesure = useRef<HTMLSpanElement>(null)
  // Pas de ref de rappel : le Slot du déclencheur la recompose à chaque rendu, d'où une boucle.
  useLayoutEffect(() => {
    const element = mesure.current
    setCoupe(!!element && element.scrollWidth > element.clientWidth)
  }, [texte])

  const contenu = (
    <span ref={mesure} className={cn('min-w-0 truncate', className)}>
      {children ?? texte}
    </span>
  )

  if (!coupe) {
    return contenu
  }

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>{contenu}</TooltipTrigger>
        <TooltipContent>{texte}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

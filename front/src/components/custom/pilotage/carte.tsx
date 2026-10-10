import type { ReactNode } from 'react'

import { ACTIVITY_DEFINITIONS } from '@/constants/activity.constant.ts'
import { cn } from '@/libs/utils.ts'

export function Carte({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'bg-carte border border-border rounded-[10px] px-5 py-[18px] flex flex-col',
        className,
      )}
    >
      {children}
    </section>
  )
}

export const definition = (libelle: string) =>
  ACTIVITY_DEFINITIONS.find((d) => d.label === libelle)?.definition

// Textes de `ACTIVITY_DEFINITIONS` tels quels, dans l'ordre demandé.
export function Definitions({ libelles }: { libelles: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 mt-1.5 pt-2.5 border-t border-dashed border-border text-xs leading-[1.45] text-text-light">
      {libelles.map((libelle) => (
        <span key={libelle}>
          <strong className="text-text-dark">{libelle} : </strong>
          {definition(libelle)}
        </span>
      ))}
    </div>
  )
}

export type Ligne = {
  libelle: string
  valeur: number
  texte: string
  attenue?: boolean
}

export function Barres({
  lignes,
  couleur,
  vide,
  gras,
}: {
  lignes: Ligne[]
  couleur: string
  vide: string
  gras?: boolean
}) {
  if (lignes.length === 0) {
    return <p className="text-sm text-text-light">{vide}</p>
  }
  const max = Math.max(...lignes.map((l) => l.valeur), 0)
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {lignes.map((l) => (
        <li
          key={l.libelle}
          className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3"
        >
          <span className="truncate text-text-dark" title={l.libelle}>
            {l.libelle}
          </span>
          <span className="h-2 rounded-[3px] bg-muted overflow-hidden">
            <span
              className={cn('block h-full rounded-[3px]', couleur)}
              style={{ width: max > 0 ? `${(l.valeur / max) * 100}%` : 0 }}
            />
          </span>
          <span
            className={cn(
              'min-w-9 text-right tabular-nums',
              l.attenue ? 'text-text-light' : 'text-foreground',
              gras && !l.attenue && 'font-semibold',
            )}
          >
            {l.texte}
          </span>
        </li>
      ))}
    </ul>
  )
}

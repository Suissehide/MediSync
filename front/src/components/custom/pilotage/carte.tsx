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

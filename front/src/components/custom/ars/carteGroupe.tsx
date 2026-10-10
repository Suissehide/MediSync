import { useId } from 'react'

import { LigneIndicateur } from '@/components/custom/ars/ligne.tsx'
import {
  compter,
  type Filtre,
  statut,
  visible,
} from '@/components/custom/ars/statut.ts'
import { Carte } from '@/components/custom/pilotage/carte.tsx'
import type { ArsIndicator } from '@/types/arsIndicator.ts'

export function CarteGroupe({
  numero,
  nom,
  indicateurs,
  filtre,
}: {
  numero: number
  nom: string
  indicateurs: ArsIndicator[]
  filtre: Filtre
}) {
  const titreId = useId()
  const lignes = indicateurs.filter((i) => visible(statut(i), filtre))
  if (lignes.length === 0) {
    return null
  }

  const restant = compter(indicateurs, 'restant')
  const indisponible = compter(indicateurs, 'indisponible')
  const resume = [
    `${indicateurs.length} indicateurs`,
    restant > 0 && `${restant} à saisir`,
    indisponible > 0 &&
      `${indisponible} non disponible${indisponible > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Carte className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3.5 border-b border-border">
        <h2 id={titreId} className="flex items-baseline gap-2.5">
          <span className="text-[13px] font-bold text-text-light tabular-nums">
            {numero}
          </span>
          <span className="text-base font-semibold text-foreground">{nom}</span>
        </h2>
        <span className="text-[13px] text-text-light">{resume}</span>
      </div>
      <table aria-labelledby={titreId} className="w-full border-collapse">
        <thead className="sr-only">
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Libellé</th>
            <th scope="col">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((i) => (
            <LigneIndicateur
              key={i.code}
              indicateur={i}
              parent={
                i.code.endsWith('bis')
                  ? indicateurs.find((p) => p.code === i.code.slice(0, -3))
                  : undefined
              }
            />
          ))}
        </tbody>
      </table>
    </Carte>
  )
}

import { Fragment, useId } from 'react'

import { BreakdownRows } from '@/components/custom/indicators/breakdownRows.tsx'
import { LigneIndicateur } from '@/components/custom/indicators/ligne.tsx'
import {
  compter,
  type Filtre,
  statut,
  visible,
} from '@/components/custom/indicators/statut.ts'
import { Carte } from '@/components/custom/pilotage/carte.tsx'
import type { IndicatorResult } from '@/types/indicatorSet.ts'

export function CarteGroupe({
  setId,
  numero,
  nom,
  indicateurs,
  tous,
  filtre,
  annee,
}: {
  setId: string
  numero: number
  nom: string
  indicateurs: IndicatorResult[]
  // Le parent d'un indicateur peut vivre dans un autre groupe.
  tous: IndicatorResult[]
  filtre: Filtre
  annee: number | null
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
            <Fragment key={`${i.id}-${annee}`}>
              <LigneIndicateur
                setId={setId}
                indicateur={i}
                annee={annee}
                parent={tous.find((p) => p.id === i.parentId)}
              />
              {i.breakdown && (
                <BreakdownRows lignes={i.breakdown} total={i.value} />
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Carte>
  )
}

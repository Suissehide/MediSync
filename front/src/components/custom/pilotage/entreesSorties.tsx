import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import { Carte } from '@/components/custom/pilotage/carte.tsx'
import type { MonthlyCell } from '@/types/activity.ts'

dayjs.extend(utc)

const MOIS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
]

const hauteur = (n: number, max: number) => `${max > 0 ? (n / max) * 100 : 0}%`

export function EntreesSorties({ mois }: { mois: MonthlyCell[] }) {
  const courant = dayjs.utc().format('YYYY-MM')
  const colonnes = mois.map((m) => ({
    ...m,
    libelle: MOIS[Number(m.month.slice(5, 7)) - 1],
    futur: m.month > courant,
  }))
  const max = Math.max(
    0,
    ...colonnes
      .filter((c) => !c.futur)
      .flatMap((c) => [c.newlyIncluded, c.exited]),
  )
  const grille = {
    gridTemplateColumns: `repeat(${colonnes.length}, minmax(0, 1fr))`,
  }
  return (
    <Carte className="gap-3.5">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">
          Entrées et sorties par mois
        </h2>
        <div className="flex gap-3.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-primary" />
            Nouveaux inclus
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-sortis" />
            Sortis
          </span>
        </div>
      </div>
      <div
        className="grid gap-1.5 items-end h-[150px] border-b border-border"
        style={grille}
      >
        {colonnes.map((c) => {
          if (c.futur) {
            return <div key={c.month} />
          }
          const resume = `${c.libelle} : ${c.newlyIncluded} inclus, ${c.exited} sortis`
          return (
            <div
              key={c.month}
              role="img"
              title={resume}
              aria-label={resume}
              className="flex items-end justify-center gap-0.5 h-full"
            >
              <span
                className="w-[42%] max-w-3.5 bg-primary rounded-t-sm"
                style={{ height: hauteur(c.newlyIncluded, max) }}
              />
              <span
                className="w-[42%] max-w-3.5 bg-sortis rounded-t-sm"
                style={{ height: hauteur(c.exited, max) }}
              />
            </div>
          )
        })}
      </div>
      <div className="grid gap-1.5 text-center" style={grille}>
        {colonnes.map((c) => (
          <div key={c.month} className="flex flex-col gap-0.5 text-xs">
            <span className="text-text-light">{c.libelle}</span>
            <span className="min-h-4 font-semibold text-foreground tabular-nums">
              {c.futur ? '' : c.active}
            </span>
          </div>
        ))}
      </div>
      <span className="text-xs text-text-light">
        Ligne du bas : file active du mois.
      </span>
    </Carte>
  )
}

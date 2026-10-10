import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Barres, Carte } from '@/components/custom/pilotage/carte.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { JOURS } from '@/constants/activity.constant.ts'
import { pourcent } from '@/libs/activityCsv.ts'
import { cn } from '@/libs/utils.ts'
import type { AbsenceCell, ActivityReport } from '@/types/activity.ts'

type Thematique = ActivityReport['absences']['byThematic'][number]

const rouge = (p: number) =>
  `color-mix(in oklab, var(--color-destructive) ${p}%, transparent)`

// La teinte suit le taux, saturée à 40 % ; le pourcentage reste écrit, la couleur n'est jamais seule.
const teinte = (c: AbsenceCell) =>
  c.rate === null
    ? undefined
    : {
        backgroundColor: rouge(
          Math.round(4 + (Math.min(c.rate, 0.4) / 0.4) * 28),
        ),
      }

function Case({ c }: { c: AbsenceCell }) {
  if (c.pointed === 0) {
    return <span className="text-text-sidebar">·</span>
  }
  return c.rate === null ? (
    <span
      className="text-text-light"
      title={`${c.pointed} rendez-vous pointés : trop peu pour un taux`}
    >
      {c.pointed} rdv
    </span>
  ) : (
    <span title={`${c.absent} absents sur ${c.pointed} pointés`}>
      {pourcent(c.rate)}
    </span>
  )
}

const TRIS = {
  taux: (a: Thematique, b: Thematique) =>
    (b.total.rate ?? 0) - (a.total.rate ?? 0) ||
    b.total.pointed - a.total.pointed,
  az: (a: Thematique, b: Thematique) =>
    a.thematic.localeCompare(b.thematic, 'fr'),
}

export function CarteAbsences({ r }: { r: ActivityReport }) {
  const [tri, setTri] = useState<keyof typeof TRIS>('taux')
  const [faibleOuvert, setFaibleOuvert] = useState(false)
  const jours = r.absences.weekdays
  const lignes = [...r.absences.byThematic].sort(TRIS[tri])
  const principales = lignes.filter((t) => t.total.rate !== null)
  const faibles = lignes.filter((t) => t.total.rate === null)

  const rangee = (t: Thematique, faible: boolean) => (
    <tr
      key={t.thematic}
      className={cn(
        'border-b border-muted',
        faible ? 'h-9 bg-surface-douce text-[13px] text-text-light' : 'h-10',
      )}
    >
      <th
        scope="row"
        title={t.thematic}
        className={cn(
          'text-left font-normal pr-3.5',
          faible ? 'pl-9 text-text-dark' : 'pl-3.5 text-foreground',
        )}
      >
        <span className="block truncate min-w-0">{t.thematic}</span>
      </th>
      {jours.map((d) => (
        <td key={d} className="text-center" style={teinte(t.cells[d])}>
          <Case c={t.cells[d]} />
        </td>
      ))}
      <td
        className={cn(
          'text-center border-l border-border',
          !faible && 'font-semibold text-foreground',
        )}
      >
        <Case c={t.total} />
      </td>
    </tr>
  )

  return (
    <Carte className="gap-3.5">
      <div className="flex flex-wrap justify-between items-center gap-2.5">
        <h2 className="text-base font-semibold text-foreground">
          Carte des absences
        </h2>
        <div className="flex items-center gap-2 text-[13px] text-text-light">
          Trier par
          <ToggleGroup
            value={tri}
            onValueChange={(v) => v && setTri(v as keyof typeof TRIS)}
            className="bg-muted border-0 rounded-md p-0.5"
          >
            {[
              ['taux', 'Taux'],
              ['az', 'A → Z'],
            ].map(([id, label]) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="h-[26px] px-2.5 text-[13px] data-[state=on]:bg-carte data-[state=on]:text-foreground data-[state=on]:font-semibold data-[state=on]:shadow-sm"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm tabular-nums">
          <colgroup>
            <col />
            {jours.map((d) => (
              <col key={d} className="w-24" />
            ))}
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="h-10 bg-surface-douce border-b border-border text-[13px] text-text-light">
              <th scope="col" className="text-left font-normal px-3.5">
                Thématique
              </th>
              {jours.map((d) => (
                <th key={d} scope="col" className="font-normal capitalize">
                  {JOURS[d]}
                </th>
              ))}
              <th
                scope="col"
                className="font-semibold text-text-dark border-l border-border"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {principales.map((t) => rangee(t, false))}
            <tr className="h-11 border-t-2 border-b border-border font-semibold text-foreground">
              <th scope="row" className="text-left font-semibold px-3.5">
                Toutes thématiques
              </th>
              {jours.map((d) => (
                <td
                  key={d}
                  className="text-center"
                  style={teinte(r.absences.byWeekday[d])}
                >
                  <Case c={r.absences.byWeekday[d]} />
                </td>
              ))}
              <td className="text-center border-l border-border">
                <Case c={r.absences.overall} />
              </td>
            </tr>
            {faibles.length > 0 && (
              <tr>
                <td colSpan={jours.length + 2} className="p-0">
                  <button
                    type="button"
                    aria-expanded={faibleOuvert}
                    onClick={() => setFaibleOuvert((o) => !o)}
                    className="w-full h-10 flex items-center gap-2 px-3.5 bg-surface-douce text-[13px] text-text-dark text-left cursor-pointer"
                  >
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        'size-3.5 text-text-light transition-transform',
                        faibleOuvert && 'rotate-90',
                      )}
                    />
                    <span className="flex-1">
                      Autres thématiques · faible volume ({faibles.length})
                    </span>
                    <span className="text-xs text-text-light">
                      Moins de 5 rendez-vous pointés : pas de taux
                    </span>
                  </button>
                </td>
              </tr>
            )}
            {faibleOuvert && faibles.map((t) => rangee(t, true))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 text-xs text-text-light">
        <span>0 %</span>
        <span
          aria-hidden
          className="w-[120px] h-2 rounded-[2px]"
          style={{
            background: `linear-gradient(90deg, ${rouge(4)}, ${rouge(32)})`,
          }}
        />
        <span>40 %</span>
        <span className="ml-2">· aucun rendez-vous pointé</span>
      </div>

      <div className="flex flex-col gap-2.5 pt-3.5 border-t border-muted">
        <h3 className="text-sm font-semibold text-foreground">Par parcours</h3>
        <Barres
          couleur="bg-destructive opacity-75"
          gras
          lignes={r.absences.byPathway.map((p) => ({
            libelle: p.pathway,
            valeur: p.cell.rate ?? 0,
            texte:
              p.cell.rate === null
                ? `${p.cell.pointed} rdv`
                : pourcent(p.cell.rate),
            attenue: p.cell.rate === null,
          }))}
          vide="Aucun rendez-vous pointé."
        />
      </div>
    </Carte>
  )
}

import { Carte, definition } from '@/components/custom/pilotage/carte.tsx'
import type { ActivityReport } from '@/types/activity.ts'

const part = (n: number, total: number) => (total > 0 ? n / total : null)

export function Bilans({ r }: { r: ActivityReport }) {
  const lignes = [
    {
      libelle: 'Diagnostics éducatifs réalisés',
      n: r.sessions.educationalDiagnoses,
      total: r.patients.newlyIncluded,
      base: 'Rapporté aux nouveaux inclus',
    },
    {
      libelle: 'Bilans de fin réalisés',
      n: r.sessions.finalReviews,
      total: r.patients.exited,
      base: 'Rapporté aux sortis',
    },
  ]
  return (
    <Carte className="gap-3.5">
      <h2 className="text-base font-semibold text-foreground">
        Bilans et suivi éducatif
      </h2>
      {lignes.map((l) => {
        const taux = part(l.n, l.total)
        return (
          <div key={l.libelle} className="flex flex-col gap-1.5">
            <div className="flex justify-between items-baseline gap-3 text-sm">
              <span className="text-text-dark">{l.libelle}</span>
              <span className="tabular-nums whitespace-nowrap">
                <strong className="text-foreground">{l.n}</strong>
                <span className="text-text-light">
                  {` / ${l.total} · ${taux === null ? '—' : `${Math.round(taux * 100)} %`}`}
                </span>
              </span>
            </div>
            <span className="h-2 bg-muted rounded-[3px] overflow-hidden">
              <span
                className="block h-full min-w-0.5 bg-primary rounded-[3px]"
                style={{ width: `${Math.min((taux ?? 0) * 100, 100)}%` }}
              />
            </span>
            <span className="text-xs text-text-light">{l.base}</span>
          </div>
        )
      })}
      <div className="flex justify-between items-baseline gap-3 pt-3 border-t border-muted text-sm">
        <span className="text-text-dark">Délai adressage → entrée</span>
        <span className="text-[13px] text-text-light text-right">
          Non calculé
        </span>
      </div>
      <span className="text-xs leading-[1.45] text-text-light">
        {definition('Délai adressage → entrée')}
      </span>
    </Carte>
  )
}

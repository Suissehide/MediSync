import {
  Barres,
  Carte,
  Definitions,
} from '@/components/custom/pilotage/carte.tsx'
import { heures, pourcent } from '@/libs/activityCsv.ts'
import type { ActivityReport } from '@/types/activity.ts'

export function Seances({
  r,
  definitions,
}: {
  r: ActivityReport
  definitions: boolean
}) {
  const { individual, collective, educationalDiagnoses, finalReviews } =
    r.sessions
  const total = individual + collective
  const parts = [
    { n: individual, libelle: 'Individuelles', couleur: 'bg-primary' },
    { n: collective, libelle: 'Collectives', couleur: 'bg-collectives' },
  ]
  const tuiles = [
    [individual, 'séance individuelle', 'séances individuelles'],
    [collective, 'séance collective', 'séances collectives'],
    [educationalDiagnoses, 'diagnostic éducatif', 'diagnostics éducatifs'],
    [finalReviews, 'bilan de fin', 'bilans de fin'],
  ] as const
  return (
    <Carte className="gap-3.5">
      <h2 className="text-base font-semibold text-foreground">
        Séances et temps soignant
      </h2>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
        {parts.map((p) => (
          <span key={p.libelle} className={p.couleur} style={{ flex: p.n }} />
        ))}
      </div>
      <div className="flex gap-3.5 text-xs text-muted-foreground">
        {parts.map((p) => (
          <span key={p.libelle} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`size-[9px] rounded-[2px] ${p.couleur}`}
            />
            {`${p.libelle} ${pourcent(total > 0 ? p.n / total : null)}`}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tuiles.map(([n, un, plusieurs]) => (
          <div
            key={plusieurs}
            className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg bg-surface-douce"
          >
            <span className="text-[22px] font-bold text-foreground tabular-nums">
              {n.toLocaleString('fr-FR')}
            </span>
            <span className="text-xs leading-[1.3] text-text-light">
              {n > 1 ? plusieurs : un}
            </span>
          </div>
        ))}
      </div>
      {definitions && (
        <Definitions
          libelles={[
            'Séances individuelles',
            'Séances collectives',
            'Diagnostics éducatifs réalisés',
            'Bilans de fin',
          ]}
        />
      )}
      <h3 className="mt-1 text-sm font-semibold text-foreground">
        Heures par métier
      </h3>
      <Barres
        couleur="bg-primary"
        lignes={r.hoursBySoignant.map((h) => ({
          libelle: h.soignant,
          valeur: h.hours,
          texte: `${heures(h.hours)} h`,
        }))}
        vide="Aucun créneau réalisé avec un soignant affecté."
      />
      {definitions && <Definitions libelles={['Heures soignant']} />}
    </Carte>
  )
}

import type { ReactNode } from 'react'

import { Carte, Definitions } from '@/components/custom/pilotage/carte.tsx'
import { JOURS } from '@/constants/activity.constant.ts'
import { pourcent } from '@/libs/activityCsv.ts'
import type { ActivityReport } from '@/types/activity.ts'

export function Reponses({
  r,
  definitions,
}: {
  r: ActivityReport
  definitions: boolean
}) {
  const { completed, dropouts, exited } = r.completion
  const parts = [
    { n: completed, libelle: 'terminés', couleur: 'bg-termine' },
    { n: dropouts, libelle: 'abandons', couleur: 'bg-abandon' },
    {
      n: exited - completed - dropouts,
      libelle: 'autres sortis',
      couleur: 'bg-autres-sortis',
    },
  ]
  const pire = r.absences.worst
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]">
      <Reponse
        question="Combien de patients"
        chiffre={String(r.patients.active)}
        unite="en file active"
        definitions={
          definitions && ['File active', 'Nouveaux inclus', 'Sortis']
        }
      >
        <span className="text-sm text-muted-foreground">
          {r.patients.newlyIncluded} nouveaux inclus, {r.patients.exited} sortis
        </span>
      </Reponse>
      <Reponse
        question="Combien ont terminé"
        chiffre={pourcent(r.completion.rate)}
        unite={`${completed} sur ${exited} sortis`}
        definitions={
          definitions && ['Ont terminé', 'Abandons', 'Taux de complétion']
        }
      >
        <div className="flex h-2.5 mt-1 rounded-full overflow-hidden bg-muted">
          {parts.map((p) => (
            <span
              key={p.libelle}
              className={p.couleur}
              style={{ flex: Math.max(p.n, 0) }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
          {parts.map((p) => (
            <span key={p.libelle} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`size-[9px] rounded-[2px] ${p.couleur}`}
              />
              {`${p.n} ${p.libelle}`}
            </span>
          ))}
        </div>
      </Reponse>
      <Reponse
        question="Où sont les absences"
        chiffre={pourcent(r.absences.overall.rate)}
        unite="des rendez-vous pointés"
        definitions={definitions && ['Absentéisme']}
      >
        <span className="text-sm text-muted-foreground">
          {pire
            ? `Le plus : ${pire.thematic}, le ${JOURS[pire.weekday]}`
            : 'Trop peu de rendez-vous pointés pour situer un pic'}
        </span>
      </Reponse>
    </div>
  )
}

function Reponse({
  question,
  chiffre,
  unite,
  definitions,
  children,
}: {
  question: string
  chiffre: string
  unite: string
  definitions: false | string[]
  children: ReactNode
}) {
  return (
    <Carte className="gap-1.5">
      <h2 className="text-sm text-text-light">{question}</h2>
      <p className="flex items-baseline gap-2">
        <span className="text-[40px] leading-tight font-bold tracking-tight tabular-nums text-foreground">
          {chiffre}
        </span>
        <span className="text-[15px] text-text-dark">{unite}</span>
      </p>
      {children}
      {definitions && <Definitions libelles={definitions} />}
    </Carte>
  )
}

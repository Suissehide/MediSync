import { createFileRoute, redirect } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import {
  ANNEES,
  anneeCivile,
  PERIOD_FORMAT,
  PeriodPicker,
} from '@/components/custom/periodPicker.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { ACTIVITY_DEFINITIONS, JOURS } from '@/constants/activity.constant.ts'
import { STOP_REASON } from '@/constants/patient.constant.ts'
import { can } from '@/hooks/useCan.ts'
import { activityCsv, heures, pourcent } from '@/libs/activityCsv.ts'
import { queryState } from '@/libs/queryState.ts'
import { useActivityQuery } from '@/queries/useActivity.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AbsenceCell, ActivityReport } from '@/types/activity.ts'
import {
  accessibleCouples,
  resolveTenantContext,
} from '@/utils/tenant-context.ts'

// Lettres, chiffres et tirets uniquement : le nom du service devient le segment du fichier.
const slugify = (nom: string): string => {
  const slug = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'service'
}

// Tableau de bord d'activité du service, en chiffres agrégés (MDS-40).
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/activite',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'activity:read')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: ActivitePage,
})

const estVide = (r: ActivityReport) =>
  r.patients.active === 0 &&
  r.patients.newlyIncluded === 0 &&
  r.patients.exited === 0 &&
  r.absences.overall.pointed === 0

function ActivitePage() {
  const params = Route.useParams()
  const user = useAuthStore((state) => state.user)
  const serviceName =
    accessibleCouples(user).find(
      (c) =>
        c.establishment.id === params.establishmentId &&
        c.service.id === params.serviceId,
    )?.service.name ?? 'Service'

  const [periode, setPeriode] = useState(() => anneeCivile(ANNEES[0]))
  const from = periode.from.format(PERIOD_FORMAT)
  const to = periode.to.format(PERIOD_FORMAT)
  const { report, isPending, error, refetch } = useActivityQuery(from, to)
  const etat = queryState({ isPending, error, hasData: report !== undefined })

  const exporter = () => {
    if (!report) {
      return
    }
    const href = URL.createObjectURL(
      new Blob([activityCsv(report, serviceName)], {
        type: 'text/csv;charset=utf-8',
      }),
    )
    const lien = document.createElement('a')
    lien.href = href
    lien.download = `activite-${slugify(serviceName)}-${from}-${to}.csv`
    lien.click()
    URL.revokeObjectURL(href)
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-4 md:p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Activité
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <PeriodPicker periode={periode} onChange={setPeriode} />
            <Button onClick={exporter} disabled={etat !== 'ready'}>
              Exporter en CSV
            </Button>
          </div>
        </div>

        {etat === 'pending' && <p className="text-text-light">Chargement...</p>}
        {etat === 'error' && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-text-light">
              Impossible de charger l'activité du service. Réessayez plus tard.
            </p>
            <Button className="self-start" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}
        {etat === 'empty' && (
          <p role="alert" className="text-text-light">
            Impossible de charger l'activité du service. Réessayez plus tard.
          </p>
        )}
        {etat === 'ready' && report && estVide(report) && (
          <p className="text-text-light">
            Aucune activité sur cette période. Choisissez une autre année ou
            élargissez la plage.
          </p>
        )}
        {etat === 'ready' && report && !estVide(report) && (
          <Rapport r={report} />
        )}
      </div>
    </DashboardLayout>
  )
}

function Rapport({ r }: { r: ActivityReport }) {
  const pire = r.absences.worst
  return (
    <>
      <section aria-label="Réponses" className="grid gap-4 md:grid-cols-3">
        <Reponse
          question="Combien de patients"
          chiffre={String(r.patients.active)}
          unite="en file active"
        >
          {r.patients.newlyIncluded} nouveaux inclus, {r.patients.exited} sortis
        </Reponse>
        <Reponse
          question="Combien ont terminé"
          chiffre={pourcent(r.completion.rate)}
          unite={`${r.completion.completed} sur ${r.completion.exited} sortis`}
        >
          {r.completion.dropouts} abandons
        </Reponse>
        <Reponse
          question="Où sont les absences"
          chiffre={pourcent(r.absences.overall.rate)}
          unite="des rendez-vous pointés"
        >
          {pire
            ? `Le plus : ${pire.thematic}, le ${JOURS[pire.weekday]}`
            : 'Trop peu de rendez-vous pointés pour situer un pic'}
        </Reponse>
      </section>

      <CarteAbsences r={r} />

      <div className="grid gap-6 md:grid-cols-2">
        <Barres
          titre="Motifs d'arrêt"
          lignes={r.completion.dropoutReasons.map((m) => ({
            libelle:
              STOP_REASON[m.reason as keyof typeof STOP_REASON] ?? m.reason,
            valeur: m.count,
            texte: String(m.count),
          }))}
          vide="Aucun abandon sur la période."
        />
        <section className="flex flex-col gap-3">
          <h2 className="text-text-dark font-semibold">
            Séances et temps soignant
          </h2>
          <p className="text-sm text-text-dark tabular-nums">
            {r.sessions.individual} séances individuelles,{' '}
            {r.sessions.collective} collectives.{' '}
            {r.sessions.educationalDiagnoses} diagnostics éducatifs,{' '}
            {r.sessions.finalReviews} bilans de fin.
          </p>
          <Barres
            titre="Heures par métier"
            lignes={r.hoursBySoignant.map((h) => ({
              libelle: h.soignant,
              valeur: h.hours,
              texte: `${heures(h.hours)} h`,
            }))}
            vide="Aucun créneau réalisé avec un soignant affecté."
          />
        </section>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-text-dark font-medium">
          Définitions
        </summary>
        <dl className="mt-3 grid gap-2 max-w-prose">
          {ACTIVITY_DEFINITIONS.map((d) => (
            <div key={d.label}>
              <dt className="font-medium text-text-dark">{d.label}</dt>
              <dd className="text-text-light">{d.definition}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  )
}

function Reponse({
  question,
  chiffre,
  unite,
  children,
}: {
  question: string
  chiffre: string
  unite: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-primary pl-4">
      <h2 className="text-sm text-text-light">{question}</h2>
      <p className="text-text-dark">
        <span className="text-4xl font-semibold tabular-nums">{chiffre}</span>{' '}
        <span className="text-sm">{unite}</span>
      </p>
      <p className="text-sm text-text-light">{children}</p>
    </div>
  )
}

// La teinte suit le taux ; le pourcentage reste écrit, la couleur n'est jamais seule.
const teinte = (c: AbsenceCell) =>
  c.rate === null
    ? undefined
    : {
        backgroundColor: `color-mix(in oklab, var(--color-destructive) ${Math.round(c.rate * 70)}%, transparent)`,
      }

function Case({ c }: { c: AbsenceCell }) {
  if (c.pointed === 0) {
    return <span className="text-text-light">·</span>
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

function CarteAbsences({ r }: { r: ActivityReport }) {
  const jours = r.absences.weekdays
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text-dark font-semibold">Carte des absences</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-max min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-text-light">
              <th
                scope="col"
                className="sticky left-0 bg-background text-left font-normal px-3 py-2"
              >
                Thématique
              </th>
              {jours.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className="font-normal px-3 py-2 capitalize"
                >
                  {JOURS[d]}
                </th>
              ))}
              <th scope="col" className="font-normal px-3 py-2">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {r.absences.byThematic.map((t) => (
              <tr key={t.thematic}>
                <th
                  scope="row"
                  className="sticky left-0 bg-background text-left font-normal text-text-dark px-3 py-2 whitespace-nowrap border-t border-border"
                >
                  {t.thematic}
                </th>
                {jours.map((d) => (
                  <td
                    key={d}
                    className="px-3 py-2 text-center tabular-nums border-t border-border"
                    style={teinte(t.cells[d])}
                  >
                    <Case c={t.cells[d]} />
                  </td>
                ))}
                <td className="px-3 py-2 text-center tabular-nums font-medium border-t border-border">
                  <Case c={t.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Barres
        titre="Par parcours"
        lignes={r.absences.byPathway.map((p) => ({
          libelle: p.pathway,
          valeur: p.cell.rate ?? 0,
          texte:
            p.cell.rate === null
              ? `${p.cell.pointed} rdv`
              : pourcent(p.cell.rate),
        }))}
        vide="Aucun rendez-vous pointé."
      />
    </section>
  )
}

function Barres({
  titre,
  lignes,
  vide,
}: {
  titre: string
  lignes: { libelle: string; valeur: number; texte: string }[]
  vide: string
}) {
  const max = Math.max(...lignes.map((l) => l.valeur), 0)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-text-dark">{titre}</h3>
      {lignes.length === 0 ? (
        <p className="text-sm text-text-light">{vide}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {lignes.map((l) => (
            <li
              key={l.libelle}
              className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate text-text-dark" title={l.libelle}>
                {l.libelle}
              </span>
              <span className="h-2 rounded-sm bg-muted">
                <span
                  className="block h-full rounded-sm bg-primary"
                  style={{ width: max > 0 ? `${(l.valeur / max) * 100}%` : 0 }}
                />
              </span>
              <span className="tabular-nums text-text-light">{l.texte}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

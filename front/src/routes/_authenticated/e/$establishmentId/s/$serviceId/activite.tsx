import { createFileRoute, redirect } from '@tanstack/react-router'
import { BookOpen, Download, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import {
  ANNEES,
  anneeCivile,
  PERIOD_FORMAT,
  PeriodPicker,
} from '@/components/custom/periodPicker.tsx'
import { Bilans } from '@/components/custom/pilotage/bilans.tsx'
import { EntreesSorties } from '@/components/custom/pilotage/entreesSorties.tsx'
import { Reponses } from '@/components/custom/pilotage/reponses.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Select } from '@/components/ui/select.tsx'
import { JOURS } from '@/constants/activity.constant.ts'
import { STOP_REASON } from '@/constants/patient.constant.ts'
import { can } from '@/hooks/useCan.ts'
import { useServiceName } from '@/hooks/useServiceName.ts'
import { activityCsv, heures, pourcent } from '@/libs/activityCsv.ts'
import { slugify, telechargerCsv } from '@/libs/csv.ts'
import { queryState } from '@/libs/queryState.ts'
import { useActivityQuery } from '@/queries/useActivity.ts'
import { usePathwayTemplateQueries } from '@/queries/usePathwayTemplate.ts'
import type { AbsenceCell, ActivityReport } from '@/types/activity.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

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
  const serviceName = useServiceName(params.establishmentId, params.serviceId)

  const [periode, setPeriode] = useState(() => anneeCivile(ANNEES[0]))
  const [parcours, setParcours] = useState('')
  const [definitions, setDefinitions] = useState(false)
  const from = periode.from.format(PERIOD_FORMAT)
  const to = periode.to.format(PERIOD_FORMAT)
  const { report, isPending, error, refetch } = useActivityQuery(
    from,
    to,
    parcours || undefined,
  )
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const etat = queryState({ isPending, error, hasData: report !== undefined })

  const exporter = () => {
    if (!report) {
      return
    }
    telechargerCsv(
      activityCsv(report, serviceName),
      `activite-${slugify(serviceName)}-${from}-${to}.csv`,
    )
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-muted p-4 md:p-6 rounded-lg w-full overflow-auto">
        <div className="max-w-[1320px] mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-foreground">Activité</h1>
              <p className="flex items-center gap-1.5 text-[13px] text-text-light">
                <ShieldCheck aria-hidden className="size-3.5" />
                Chiffres agrégés uniquement, aucune donnée nominative.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <PeriodPicker periode={periode} onChange={setPeriode} presets />
              <div className="w-56">
                <label htmlFor="filtre-parcours" className="sr-only">
                  Parcours
                </label>
                <Select
                  id="filtre-parcours"
                  className="bg-carte"
                  placeholder="Tous les parcours"
                  options={(pathwayTemplates ?? []).map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  value={parcours}
                  onValueChange={setParcours}
                />
              </div>
              <Button
                variant="outline"
                aria-pressed={definitions}
                onClick={() => setDefinitions((d) => !d)}
                className="font-normal text-text-dark bg-carte aria-pressed:bg-primary/10 aria-pressed:border-primary aria-pressed:text-primary"
              >
                <BookOpen aria-hidden className="size-4" />
                Définitions
              </Button>
              <Button onClick={exporter} disabled={etat !== 'ready'}>
                <Download aria-hidden className="size-4" />
                Exporter en CSV
              </Button>
            </div>
          </div>

          {etat === 'pending' && (
            <p className="text-text-light">Chargement...</p>
          )}
          {etat === 'error' && (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-text-light">
                Impossible de charger l'activité du service. Réessayez plus
                tard.
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
            <Rapport r={report} definitions={definitions} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

function Rapport({
  r,
  definitions,
}: {
  r: ActivityReport
  definitions: boolean
}) {
  return (
    <>
      <Reponses r={r} definitions={definitions} />

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))]">
        <EntreesSorties mois={r.monthly} />
        <Bilans r={r} />
      </div>

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
    </>
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

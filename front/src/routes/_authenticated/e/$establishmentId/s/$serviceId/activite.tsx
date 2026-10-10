import { createFileRoute, redirect } from '@tanstack/react-router'
import { BookOpen, Download, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import {
  ANNEES,
  anneeCivile,
  PERIOD_FORMAT,
  PeriodPicker,
} from '@/components/custom/periodPicker.tsx'
import { CarteAbsences } from '@/components/custom/pilotage/absences.tsx'
import { Bilans } from '@/components/custom/pilotage/bilans.tsx'
import { EntreesSorties } from '@/components/custom/pilotage/entreesSorties.tsx'
import { Motifs } from '@/components/custom/pilotage/motifs.tsx'
import { Reponses } from '@/components/custom/pilotage/reponses.tsx'
import { Seances } from '@/components/custom/pilotage/seances.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Select } from '@/components/ui/select.tsx'
import { can } from '@/hooks/useCan.ts'
import { useServiceName } from '@/hooks/useServiceName.ts'
import { activityCsv } from '@/libs/activityCsv.ts'
import { slugify, telechargerCsv } from '@/libs/csv.ts'
import { queryState } from '@/libs/queryState.ts'
import { useActivityQuery } from '@/queries/useActivity.ts'
import { usePathwayTemplateQueries } from '@/queries/usePathwayTemplate.ts'
import type { ActivityReport } from '@/types/activity.ts'
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

  const nomParcours = pathwayTemplates?.find((p) => p.id === parcours)?.name

  const exporter = () => {
    if (!report) {
      return
    }
    telechargerCsv(
      activityCsv(report, serviceName, nomParcours),
      `activite-${slugify(serviceName)}-${from}-${to}${
        nomParcours ? `-${slugify(nomParcours)}` : ''
      }.csv`,
    )
  }

  return (
    <DashboardLayout>
      <div className="relative flex-1 min-h-0 bg-muted p-4 md:p-6 rounded-lg w-full overflow-auto">
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
              {parcours
                ? 'Aucune activité sur cette période pour ce parcours. Choisissez une autre période ou « Tous les parcours ».'
                : 'Aucune activité sur cette période. Choisissez une autre année ou élargissez la plage.'}
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

      <div className="grid gap-3 items-start grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))]">
        <Motifs r={r} />
        <Seances r={r} definitions={definitions} />
      </div>

      <p className="text-center text-xs text-text-light">
        Moins de 5 rendez-vous pointés : pas de taux. Mêmes définitions à
        l'écran et dans l'export CSV.
      </p>
    </>
  )
}

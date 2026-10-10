import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { Download, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'

import { ArsIndicatorApi } from '@/api/arsIndicator.api.ts'
import { Bandeau } from '@/components/custom/ars/bandeau.tsx'
import { CarteGroupe } from '@/components/custom/ars/carteGroupe.tsx'
import type { Filtre } from '@/components/custom/ars/statut.ts'
import {
  ANNEES,
  anneeCivile,
  PERIOD_FORMAT,
  PeriodPicker,
} from '@/components/custom/periodPicker.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { can } from '@/hooks/useCan.ts'
import { useServiceName } from '@/hooks/useServiceName.ts'
import { arsCsv } from '@/libs/arsCsv.ts'
import { slugify, telecharger, telechargerCsv } from '@/libs/csv.ts'
import { queryState } from '@/libs/queryState.ts'
import { useArsIndicatorsQuery } from '@/queries/useArsIndicator.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Ce module lit `dayjs.utc` des son chargement : il enregistre le greffon lui-meme, comme
// `utils/weekCycle.ts` et `ui/weekPicker.tsx` — `main.tsx` n'est pas charge sous test.
dayjs.extend(utc)

// Indicateurs de l'enquête annuelle ARS, en chiffres agrégés (MDS-26). Même garde et même
// redirection que `patient/$patientID/acces.tsx` : le contexte reste valide, seule la permission
// manque.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'stats:read')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: ArsIndicatorsPage,
})

const GROUPES = ['Entrée', 'Séances', 'Sortie', 'Modalités'] as const

function ArsIndicatorsPage() {
  const params = Route.useParams()
  const serviceName = useServiceName(params.establishmentId, params.serviceId)
  const [periode, setPeriode] = useState(() => anneeCivile(ANNEES[0]))
  const from = periode.from.format(PERIOD_FORMAT)
  const to = periode.to.format(PERIOD_FORMAT)
  const { indicators, manualYear, isPending, error, refetch } =
    useArsIndicatorsQuery(from, to)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [erreurExport, setErreurExport] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<Filtre>('tous')

  const etat = queryState({
    isPending,
    error,
    hasData: indicators !== undefined,
  })

  // `handleHttpError` lève : sans ce catch le bouton resterait muet sur un rejet non traité.
  const exporterExcel = async () => {
    setExportEnCours(true)
    setErreurExport(null)
    try {
      telecharger(
        await ArsIndicatorApi.exportExcel(from, to),
        `indicateurs-ars_${from}_${to}.xlsx`,
      )
    } catch {
      setErreurExport("L'export a échoué. Réessayez plus tard.")
    } finally {
      setExportEnCours(false)
    }
  }

  const exporterCsv = () => {
    if (indicators) {
      telechargerCsv(
        arsCsv(indicators, serviceName, from, to),
        `indicateurs-ars-${slugify(serviceName)}-${from}-${to}.csv`,
      )
    }
  }

  return (
    <DashboardLayout>
      <div className="relative flex-1 min-h-0 bg-muted p-4 md:p-6 rounded-lg w-full overflow-auto">
        <div className="max-w-[1320px] mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-foreground">
                Indicateurs ARS
              </h1>
              <p className="text-[13px] text-text-light">
                Enquête annuelle ETP · chiffres agrégés, aucune donnée
                nominative.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <PeriodPicker periode={periode} onChange={setPeriode} />
              <Button
                onClick={exporterExcel}
                disabled={etat !== 'ready' || exportEnCours}
              >
                <FileSpreadsheet aria-hidden className="size-4" />
                {exportEnCours ? 'Export…' : 'Exporter en Excel'}
              </Button>
              <Button
                variant="outline"
                aria-label="Exporter en CSV"
                onClick={exporterCsv}
                disabled={etat !== 'ready'}
                className="bg-carte"
              >
                <Download aria-hidden className="size-4" />
                CSV
              </Button>
            </div>
          </div>

          {erreurExport && (
            <p role="alert" className="text-sm text-destructive">
              {erreurExport}
            </p>
          )}

          {etat === 'pending' && (
            <p className="text-text-light">Chargement...</p>
          )}

          {(etat === 'error' || etat === 'empty') && (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-text-light">
                Impossible de charger les indicateurs. Réessayez plus tard.
              </p>
              <Button className="self-start" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          )}

          {etat === 'ready' && indicators && (
            <>
              <Bandeau
                indicateurs={indicators}
                filtre={filtre}
                onFiltre={setFiltre}
              />
              {GROUPES.map((groupe, index) => (
                <CarteGroupe
                  key={groupe}
                  numero={index + 1}
                  nom={groupe}
                  indicateurs={indicators.filter((i) => i.group === groupe)}
                  filtre={filtre}
                  annee={manualYear}
                />
              ))}
              <p className="text-center text-xs text-text-light">
                Les valeurs saisies à la main sont reprises dans l'export Excel.
                Détail des patients, absences et séances dans{' '}
                <Link
                  to="/e/$establishmentId/s/$serviceId/activite"
                  params={params}
                  className="text-primary hover:text-primary-dark"
                >
                  Activité
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

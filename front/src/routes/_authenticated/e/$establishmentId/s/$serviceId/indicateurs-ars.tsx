import { createFileRoute, redirect } from '@tanstack/react-router'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useState } from 'react'

import { ArsIndicatorApi } from '@/api/arsIndicator.api.ts'
import {
  ANNEES,
  anneeCivile,
  PERIOD_FORMAT,
  PeriodPicker,
} from '@/components/custom/periodPicker.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { can } from '@/hooks/useCan.ts'
import { queryState } from '@/libs/queryState.ts'
import { useArsIndicatorsQuery } from '@/queries/useArsIndicator.ts'
import type { ArsIndicator } from '@/types/arsIndicator.ts'
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
  const [periode, setPeriode] = useState(() => anneeCivile(ANNEES[0]))
  const { indicators, isPending, error } = useArsIndicatorsQuery(
    periode.from.format(PERIOD_FORMAT),
    periode.to.format(PERIOD_FORMAT),
  )
  const [exportEnCours, setExportEnCours] = useState(false)
  const [erreurExport, setErreurExport] = useState<string | null>(null)

  const etat = queryState({
    isPending,
    error,
    hasData: indicators !== undefined,
  })

  // `handleHttpError` lève : sans ce catch le bouton resterait muet sur un rejet non traité.
  const telecharger = async () => {
    setExportEnCours(true)
    setErreurExport(null)
    try {
      const blob = await ArsIndicatorApi.exportExcel(
        periode.from.format(PERIOD_FORMAT),
        periode.to.format(PERIOD_FORMAT),
      )
      const href = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = href
      lien.download = `indicateurs-ars_${periode.from.format(PERIOD_FORMAT)}_${periode.to.format(PERIOD_FORMAT)}.xlsx`
      lien.click()
      URL.revokeObjectURL(href)
    } catch {
      setErreurExport("L'export a échoué. Réessayez plus tard.")
    } finally {
      setExportEnCours(false)
    }
  }

  return (
    <DashboardLayout>
      {/* `overflow-hidden` + une zone de défilement interne : sans cela la grille (trente lignes,
          ~1360px) débordait sous la carte et emportait l'en-tête au défilement, alors que les
          autres écrans gardent leurs contrôles en place. Même découpe que `suivi.tsx`. */}
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Indicateurs ARS
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            <PeriodPicker periode={periode} onChange={setPeriode} />

            <Button
              onClick={telecharger}
              disabled={etat !== 'ready' || exportEnCours}
            >
              {exportEnCours ? 'Export…' : 'Exporter'}
            </Button>
          </div>
        </div>

        {erreurExport && (
          <p role="alert" className="text-sm text-destructive">
            {erreurExport}
          </p>
        )}

        {etat === 'pending' && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Chargement...
          </div>
        )}

        {(etat === 'error' || etat === 'empty') && (
          <div
            role="alert"
            className="flex-1 flex items-center justify-center text-text-light"
          >
            Impossible de charger les indicateurs. Réessayez plus tard.
          </div>
        )}

        {etat === 'ready' && indicators && (
          <div className="flex-1 min-h-0 overflow-auto">
            <TableIndicateurs indicateurs={indicators} />
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function TableIndicateurs({ indicateurs }: { indicateurs: ArsIndicator[] }) {
  return (
    // Bande de groupe NON collante : chaque `tbody` collerait la sienne indépendamment, et les
    // quatre s'empileraient en haut de la zone de défilement. La grille tient en trente lignes,
    // on n'est jamais loin d'une bande.
    <table className="w-full text-sm border-collapse">
      <thead className="sr-only">
        <tr>
          <th>Code</th>
          <th>Libellé</th>
          <th>Valeur</th>
        </tr>
      </thead>
      {GROUPES.map((groupe) => (
        <tbody key={groupe}>
          <tr>
            <th
              colSpan={3}
              className="bg-muted text-left text-text-dark font-semibold px-3 py-2"
            >
              {groupe}
            </th>
          </tr>
          {indicateurs
            .filter((indicateur) => indicateur.group === groupe)
            .map((indicateur) => (
              <tr key={indicateur.code} className="border-b border-border">
                <td className="w-20 px-3 py-2 align-top text-text-light tabular-nums">
                  {indicateur.code}
                </td>
                <td className="px-3 py-2 align-top">
                  <span
                    className={
                      indicateur.note ? 'text-text-light' : 'text-text-dark'
                    }
                  >
                    {indicateur.label}
                  </span>
                  {/* Le motif vit sous son libellé, pas dans la colonne des valeurs : à droite il
                      s'étalait sur trois lignes et mettait de la prose là où l'œil cherche des
                      nombres. */}
                  {indicateur.note && (
                    <span className="block text-xs text-text-light mt-0.5">
                      {indicateur.note}
                    </span>
                  )}
                </td>
                <td className="w-24 px-3 py-2 align-top text-right">
                  {indicateur.value === null ? (
                    <span className="text-text-light">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Sans valeur</span>
                    </span>
                  ) : (
                    <span className="text-text-dark font-medium tabular-nums">
                      {indicateur.value}
                    </span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      ))}
    </table>
  )
}

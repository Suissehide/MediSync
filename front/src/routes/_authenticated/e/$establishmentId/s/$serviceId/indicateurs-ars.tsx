import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { can } from '@/hooks/useCan.ts'
import { ArsIndicatorApi } from '@/api/arsIndicator.api.ts'
import { useArsIndicatorsQuery } from '@/queries/useArsIndicator.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

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
  const [year, setYear] = useState(new Date().getFullYear())
  const { indicators, isPending, from, to } = useArsIndicatorsQuery(year)

  const telecharger = async () => {
    const blob = await ArsIndicatorApi.exportExcel(from, to)
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `indicateurs-ars_${from}_${to}.xlsx`
    a.click()
    URL.revokeObjectURL(href)
  }

  const annees = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Indicateurs ARS</h1>
        <div className="flex items-center gap-2">
          <select
            aria-label="Année"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 rounded-md border border-(--color-border) px-2"
          >
            {annees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Button onClick={telecharger} disabled={isPending}>
            Exporter
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="mt-6">Chargement…</p>
      ) : (
        GROUPES.map((groupe) => (
          <section key={groupe} className="mt-8">
            <h2 className="mb-2 text-lg font-medium">{groupe}</h2>
            <table className="w-full text-sm">
              <tbody>
                {indicators
                  .filter((i) => i.group === groupe)
                  .map((i) => (
                    <tr
                      key={i.code}
                      className={i.note ? 'text-(--color-muted-foreground)' : ''}
                    >
                      <td className="w-16 py-1 align-top font-mono">{i.code}</td>
                      <td className="py-1 align-top">{i.label}</td>
                      <td className="w-64 py-1 text-right align-top">
                        {i.value ?? i.note}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </DashboardLayout>
  )
}

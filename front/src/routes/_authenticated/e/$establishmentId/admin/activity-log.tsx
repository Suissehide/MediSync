import { createFileRoute, redirect } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { activityLogColumns } from '@/columns/activityLog.column.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { ReactTable } from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Select } from '@/components/ui/select.tsx'
import {
  ACTION_OPTIONS,
  PERIOD_OPTIONS,
} from '@/constants/activityLog.constant.ts'
import { can } from '@/hooks/useCan.ts'
import { useActivityLogsQuery } from '@/queries/useActivityLog.ts'
import { useServicesQuery } from '@/queries/useServices.ts'
import type { ActivityLog } from '@/types/activityLog.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Navigation par echelle (2026-09-28) : le journal d'activite est une prerogative de
// l'administrateur d'etablissement (`activity-log:read`) et couvre tout l'etablissement
// (`ActivityLogRepository.scopeFilter`, cote back), filtrable par service. Il vivait sous un
// service, ou il ne montrait que ce service et restait hors d'atteinte d'un administrateur sans
// affectation de service.
export const Route = createFileRoute('/_authenticated/e/$establishmentId/admin/activity-log')({
  // Meme garde explicite que `members.tsx`.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'activity-log:read')) {
      throw redirect({ to: '/' })
    }
  },
  component: ActivityLogPage,
})

const DEFAULT_FILTERS = { action: '', periodDays: '', userSearch: '', serviceId: '' }

const columnHelper = createColumnHelper<ActivityLog>()

function ActivityLogPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const hasActiveFilters = Object.values(filters).some(Boolean)

  const from = filters.periodDays
    ? dayjs().subtract(Number(filters.periodDays), 'day').toISOString()
    : undefined

  const { data, isPending } = useActivityLogsQuery({
    action: filters.action || undefined,
    from,
    serviceId: filters.serviceId || undefined,
  })

  // Services de l'etablissement, actifs ou non : une ligne ancienne peut venir d'un service
  // desactive depuis, et doit encore se lire par son nom.
  const { services } = useServicesQuery()
  const serviceOptions = useMemo(
    () =>
      [...(services ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [services],
  )

  const columns = useMemo(() => {
    const nomDuService = new Map((services ?? []).map((s) => [s.id, s.name]))
    const colonneService = columnHelper.accessor(
      (row) => (row.serviceId ? (nomDuService.get(row.serviceId) ?? '—') : 'Établissement'),
      { id: 'service', header: 'Service', size: 160 },
    )
    // Apres l'utilisateur : la date, l'heure, l'utilisateur, puis d'ou vient la ligne.
    return [...activityLogColumns.slice(0, 3), colonneService, ...activityLogColumns.slice(3)]
  }, [services])

  const logs = useMemo(() => {
    const all = data?.data ?? []
    if (!filters.userSearch) {
      return all
    }
    const q = filters.userSearch.toLowerCase()
    return all.filter((log) => {
      const fullName =
        `${log.userFirstName ?? ''} ${log.userLastName ?? ''}`.toLowerCase()
      return fullName.includes(q) || log.userID.toLowerCase().includes(q)
    })
  }, [data, filters.userSearch])

  const set = (key: keyof typeof DEFAULT_FILTERS) => (v: string) =>
    setFilters((prev) => ({ ...prev, [key]: v }))

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center justify-between">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Journal d'activité
          </h1>
        </div>

        <ReactTable<ActivityLog>
          data={logs}
          columns={columns}
          pagination
          filterId="activity-log"
          isLoading={isPending}
          emptyState={
            <div className="py-8 text-center text-text-light text-sm">
              Aucune activité trouvée
            </div>
          }
          customHeader={() => (
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <Input
                placeholder="Rechercher un utilisateur..."
                value={filters.userSearch}
                onChange={(e) => set('userSearch')(e.target.value)}
                iconLeft={<Search className="h-4 w-4" />}
                className="w-56"
              />
              <div className="w-52">
                <Select
                  value={filters.serviceId}
                  onValueChange={(v) => set('serviceId')(v ?? '')}
                  options={serviceOptions}
                  placeholder="Tous les services"
                  clearable
                />
              </div>
              <div className="w-60">
                <Select
                  value={filters.action}
                  onValueChange={(v) => set('action')(v ?? '')}
                  options={ACTION_OPTIONS}
                  placeholder="Toutes les actions"
                  clearable
                />
              </div>
              <div className="w-48">
                <Select
                  value={filters.periodDays}
                  onValueChange={(v) => set('periodDays')(v ?? '')}
                  options={PERIOD_OPTIONS}
                  placeholder="Toutes les périodes"
                  clearable
                />
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-text-light"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        />
      </div>
    </DashboardLayout>
  )
}

export default ActivityLogPage

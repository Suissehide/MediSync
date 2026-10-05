import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { activityLogColumns } from '@/columns/activityLog.column.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { ReactTable } from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Select } from '@/components/ui/select.tsx'
import {
  ACTION_LABELS,
  ACTION_OPTIONS,
  PERIOD_OPTIONS,
} from '@/constants/activityLog.constant.ts'
import { PLATFORM_ONLY_ACTIVITY_ACTION_LABELS } from '@/constants/superAdminAccessLog.constant.ts'
import { toSelectOptions } from '@/libs/utils.ts'
import { useActivityLogsQuery } from '@/queries/useActivityLog.ts'
import type { ActivityLog } from '@/types/activityLog.ts'
import type { Service } from '@/types/service.ts'

// Le journal de l'etablissement (administration) ou celui du seul service courant (chef de
// service) : sans `services`, ni filtre ni colonne de service.
type Props = { services?: Service[] }

// Les `member.*` sont ecrits sous l'administration : seul le journal de l'etablissement les porte.
const ACTIONS_ETABLISSEMENT = toSelectOptions({
  ...ACTION_LABELS,
  ...Object.fromEntries(
    Object.entries(PLATFORM_ONLY_ACTIVITY_ACTION_LABELS).filter(([action]) =>
      action.startsWith('member.'),
    ),
  ),
})

const DEFAULT_FILTERS = {
  action: '',
  periodDays: '',
  userSearch: '',
  serviceId: '',
}

// Pagination et recherche cote serveur (2026-09-29) : le journal couvre tout l'etablissement, la
// premiere page de 50 lignes ne suffisait plus, et chercher un auteur dans la seule page affichee
// rendait « aucune activite » alors que ses lignes existaient plus loin.
const PREMIERE_PAGE = { pageIndex: 0, pageSize: 25 }

// Meme delai que la recherche de compte de l'ecran plateforme (`super-admin/access-log.tsx`) :
// sans lui, chaque frappe lancerait une recherche sur tout le journal.
const DELAI_SAISIE_MS = 300

const columnHelper = createColumnHelper<ActivityLog>()

export function JournalActivite({ services }: Props) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [pagination, setPagination] = useState(PREMIERE_PAGE)

  const hasActiveFilters = Object.values(filters).some(Boolean)

  // Tout changement de filtre ramene a la premiere page, DANS la meme mise a jour que le filtre :
  // la page 7 d'une recherche plus etroite n'existe peut-etre pas, et un effet apres coup
  // enverrait d'abord une requete pour cette page-la.
  const revenirAuDebut = () =>
    setPagination((courant) => ({ ...courant, pageIndex: 0 }))

  const [userApplique, setUserApplique] = useState('')
  useEffect(() => {
    const minuteur = setTimeout(() => {
      // Les deux mises a jour partent ensemble : une seule requete, sur la premiere page. Cet
      // effet ne tourne que si la saisie a change ; au montage, la page est deja la premiere.
      setUserApplique(filters.userSearch.trim())
      setPagination((courant) =>
        courant.pageIndex === 0 ? courant : { ...courant, pageIndex: 0 },
      )
    }, DELAI_SAISIE_MS)
    return () => clearTimeout(minuteur)
  }, [filters.userSearch])

  // Calculee une fois par periode choisie, et non a chaque rendu : l'instant fait partie de la
  // cle de requete, et une cle qui change a chaque rendu relancerait la requete a chaque reponse.
  const from = useMemo(
    () =>
      filters.periodDays
        ? dayjs().subtract(Number(filters.periodDays), 'day').toISOString()
        : undefined,
    [filters.periodDays],
  )

  const { data, isPending } = useActivityLogsQuery({
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    action: filters.action || undefined,
    from,
    serviceId: filters.serviceId || undefined,
    user: userApplique || undefined,
    echelle: services ? 'establishment' : 'service',
  })

  // Services de l'etablissement, actifs ou non : une ligne ancienne peut venir d'un service
  // desactive depuis, et doit encore se lire par son nom.
  const serviceOptions = useMemo(
    () =>
      [...(services ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [services],
  )

  const columns = useMemo(() => {
    if (!services) {
      return activityLogColumns
    }
    const nomDuService = new Map(services.map((s) => [s.id, s.name]))
    const colonneService = columnHelper.accessor(
      (row) =>
        row.serviceId
          ? (nomDuService.get(row.serviceId) ?? '—')
          : 'Établissement',
      { id: 'service', header: 'Service', size: 160 },
    )
    // Apres l'utilisateur : la date, l'heure, l'utilisateur, puis d'ou vient la ligne.
    return [
      ...activityLogColumns.slice(0, 3),
      colonneService,
      ...activityLogColumns.slice(3),
    ]
  }, [services])

  const logs = data?.data ?? []

  const set = (key: keyof typeof DEFAULT_FILTERS) => (v: string) => {
    setFilters((prev) => ({ ...prev, [key]: v }))
    // La recherche d'auteur revient au debut quand elle s'applique, apres le delai de saisie.
    if (key !== 'userSearch') {
      revenirAuDebut()
    }
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center justify-between">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Journal d'activité
          </h1>
        </div>

        <ReactTable<ActivityLog>
          data={logs}
          columns={columns}
          serverPagination={{
            ...pagination,
            rowCount: data?.total ?? 0,
            onChange: setPagination,
          }}
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
              {services && (
                <div className="w-52">
                  <Select
                    value={filters.serviceId}
                    onValueChange={(v) => set('serviceId')(v ?? '')}
                    options={serviceOptions}
                    placeholder="Tous les services"
                    clearable
                  />
                </div>
              )}
              <div className="w-60">
                <Select
                  value={filters.action}
                  onValueChange={(v) => set('action')(v ?? '')}
                  options={services ? ACTIONS_ETABLISSEMENT : ACTION_OPTIONS}
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
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS)
                    revenirAuDebut()
                  }}
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

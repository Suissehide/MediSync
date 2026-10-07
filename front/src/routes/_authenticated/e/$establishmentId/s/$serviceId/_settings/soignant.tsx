import { createFileRoute, redirect } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getSoignantColumns } from '@/columns/soignant.column.tsx'
import AddSoignantForm from '@/components/custom/popup/addSoignantForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Input } from '@/components/ui/input.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import { useServiceMembersQuery } from '@/queries/useServiceMembers.ts'
import { useSoignantQueries } from '@/queries/useSoignant.ts'
import { useThematicQueries } from '@/queries/useThematic.tsx'
import type { Soignant } from '@/types/soignant.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Soignants du SERVICE (2026-09-29) : un soignant est un metier qui intervient ici, pas une
// personne unique de l'etablissement. Le coordinateur (`referentials:write`) les gere, leurs
// thematiques, et les comptes qui les incarnent dans ce service.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/soignant',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'referentials:write')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: SoignantSettings,
})

function SoignantSettings() {
  // Le menu ne montre cette page qu'aux détenteurs de `referentials:write` (le coordinateur),
  // mais l'URL se tape à la main : les actions d'écriture se gardent aussi
  // ici, indépendamment du menu.
  const canManage = useCan('referentials:write')
  const { soignants, isPending } = useSoignantQueries()
  const { thematics } = useThematicQueries()
  const { members } = useServiceMembersQuery()

  const [searchTerm, setSearchTerm] = useState('')

  const sortedSoignants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (soignants ?? [])
      .filter((x) => !term || x.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [soignants, searchTerm])

  const thematicOptions = useMemo(
    () =>
      [...(thematics ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((t) => ({ value: t.id, label: t.name })),
    [thematics],
  )

  const columns = useMemo(
    () =>
      getSoignantColumns({
        thematics: thematics ?? [],
        thematicOptions,
        members: members ?? [],
        canManage,
      }),
    [thematics, thematicOptions, members, canManage],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Soignants
          </h1>
          <div className="flex items-center gap-3">
            <Input
              iconLeft={<Search className="w-4 h-4" />}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom du soignant..."
              className="w-72"
            />
            {canManage && <AddSoignantForm />}
          </div>
        </div>

        <ReactTable<Soignant>
          data={sortedSoignants}
          columns={columns}
          filterId="soignant"
          isLoading={isPending}
        />
      </div>
    </DashboardLayout>
  )
}

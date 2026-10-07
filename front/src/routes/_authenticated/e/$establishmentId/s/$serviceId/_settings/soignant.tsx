import { createFileRoute, redirect } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getSoignantColumns } from '@/columns/soignant.column.tsx'
import AddSoignantForm from '@/components/custom/popup/addSoignantForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import { useServiceMembersQuery } from '@/queries/useServiceMembers.ts'
import {
  useSoignantMutations,
  useSoignantQueries,
} from '@/queries/useSoignant.ts'
import { useThematicQueries } from '@/queries/useThematic.ts'
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
  const [showArchived, setShowArchived] = useState(false)
  const { soignants, isPending } = useSoignantQueries(showArchived)
  const { restoreSoignant, deleteForeverSoignant } = useSoignantMutations()
  const [purgeTargetId, setPurgeTargetId] = useState<string | null>(null)
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
        onRestore: (id) => restoreSoignant.mutate(id),
        onDeleteForever: (id) => setPurgeTargetId(id),
        archived: showArchived,
        thematics: thematics ?? [],
        thematicOptions,
        members: members ?? [],
        canManage,
      }),
    [
      thematics,
      thematicOptions,
      members,
      canManage,
      showArchived,
      restoreSoignant,
    ],
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
            <div className="flex items-center gap-2">
              <Switch
                id="soignants-archives"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="soignants-archives">Archivés</Label>
            </div>
            {canManage && !showArchived && <AddSoignantForm />}
          </div>
        </div>

        <ReactTable<Soignant>
          data={sortedSoignants}
          columns={columns}
          filterId="soignant"
          isLoading={isPending}
        />

        <ConfirmDeleteForm
          open={!!purgeTargetId}
          setOpen={(open) => {
            if (!open) {
              setPurgeTargetId(null)
            }
          }}
          onConfirm={() => {
            if (purgeTargetId) {
              deleteForeverSoignant.mutate(purgeTargetId)
            }
            setPurgeTargetId(null)
          }}
          loading={deleteForeverSoignant.isPending}
          title="Supprimer définitivement"
          description="Ce soignant disparaîtra pour de bon. L'opération est refusée tant qu'il figure au planning, porte une tâche ou est incarné par un membre."
        />
      </div>
    </DashboardLayout>
  )
}

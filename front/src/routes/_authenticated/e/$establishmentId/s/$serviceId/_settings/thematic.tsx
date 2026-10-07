import { createFileRoute, redirect } from '@tanstack/react-router'
import { Archive, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getThematicColumns } from '@/columns/thematic.column.tsx'
import AddThematicForm from '@/components/custom/popup/addThematicForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import { useSoignantQueries } from '@/queries/useSoignant.ts'
import {
  useThematicMutations,
  useThematicQueries,
} from '@/queries/useThematic.ts'
import type { Thematic } from '@/types/thematic.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/thematic',
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
  component: ThematicSettings,
})

function ThematicSettings() {
  // Le menu ne montre cette page qu'aux détenteurs de `referentials:write`,
  // mais l'URL se tape à la main : les actions d'écriture se gardent aussi
  // ici, indépendamment du menu.
  const canManage = useCan('referentials:write')
  const [showArchived, setShowArchived] = useState(false)
  const { thematics, isPending } = useThematicQueries(showArchived)
  const { soignants } = useSoignantQueries()
  const { archiveThematic, restoreThematic } = useThematicMutations()
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')

  const sortedThematics = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (thematics ?? [])
      .filter((x) => !term || x.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [thematics, searchTerm])

  const soignantOptions = useMemo(
    () =>
      [...(soignants ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants],
  )

  const columns = useMemo(
    () =>
      getThematicColumns({
        onArchive: (id) => setArchiveTargetId(id),
        onRestore: (id) => restoreThematic.mutate(id),
        archived: showArchived,
        soignantOptions,
        canManage,
      }),
    [soignantOptions, canManage, showArchived, restoreThematic],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Thématiques
          </h1>
          <div className="flex items-center gap-3">
            <Input
              iconLeft={<Search className="w-4 h-4" />}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom de la thématique..."
              className="w-72"
            />
            <div className="flex items-center gap-2">
              <Switch
                id="thematiques-archivees"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="thematiques-archivees">Archivées</Label>
            </div>
            {canManage && !showArchived && <AddThematicForm />}
          </div>
        </div>

        <ReactTable<Thematic>
          data={sortedThematics}
          columns={columns}
          filterId="thematic"
          isLoading={isPending}
        />

        <ConfirmDeleteForm
          open={!!archiveTargetId}
          setOpen={(open) => {
            if (!open) {
              setArchiveTargetId(null)
            }
          }}
          onConfirm={() => {
            if (archiveTargetId) {
              archiveThematic.mutate(archiveTargetId)
            }
            setArchiveTargetId(null)
          }}
          loading={archiveThematic.isPending}
          title="Archiver la thématique"
          description="Elle sort des listes de choix. Les rendez-vous et créneaux qui la portent la conservent, et elle se restaure depuis le filtre « Archivées »."
          confirmLabel="Archiver"
          confirmLoadingLabel="Archivage..."
          confirmIcon={<Archive className="w-4 h-4" />}
        />
      </div>
    </DashboardLayout>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

import { getSoignantColumns } from '../../../../columns/soignant.column.tsx'
import AddSoignantForm from '../../../../components/custom/popup/addSoignantForm.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import ReactTable from '../../../../components/table/reactTable.tsx'
import { useSoignantQueries } from '../../../../queries/useSoignant.ts'
import { useThematicQueries } from '../../../../queries/useThematic.ts'
import type { Soignant } from '../../../../types/soignant.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/soignant',
)({
  component: SoignantSettings,
})

function SoignantSettings() {
  const { soignants } = useSoignantQueries()
  const { thematics } = useThematicQueries()

  const sortedSoignants = useMemo(
    () =>
      [...(soignants ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [soignants],
  )

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
      }),
    [thematics, thematicOptions],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Soignants
          </h1>
          <AddSoignantForm />
        </div>

        <ReactTable<Soignant>
          data={sortedSoignants}
          columns={columns}
          filterId="soignant"
        />
      </div>
    </DashboardLayout>
  )
}

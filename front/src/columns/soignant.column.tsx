import { createColumnHelper } from '@tanstack/react-table'
import { Trash } from 'lucide-react'

import DeleteSoignantForm from '../components/custom/popup/deleteSoignantForm.tsx'
import EditSoignantAccountsForm, { nomDuCompte } from '../components/custom/popup/editSoignantAccountsForm.tsx'
import EditSoignantThematicsForm from '../components/custom/popup/editSoignantThematicsForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { ServiceMember } from '../types/serviceMember.ts'
import type { Soignant } from '../types/soignant.ts'
import type { Thematic } from '../types/thematic.ts'

const columnHelper = createColumnHelper<Soignant>()

type SoignantColumnOptions = {
  thematics: Thematic[]
  thematicOptions: { value: string; label: string }[]
  // Membres du service et le soignant que chacun incarne (2026-09-29).
  members: ServiceMember[]
  // L'écran reste consultable par lecture seule ; sans `referentials:write`,
  // les actions d'écriture ne doivent pas apparaître (le menu n'est pas la
  // seule barrière, une URL se tape à la main).
  canManage: boolean
}

export const getSoignantColumns = ({
  thematics,
  thematicOptions,
  members,
  canManage,
}: SoignantColumnOptions) => {
  const columns = [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
    columnHelper.display({
      id: 'thematics',
      header: 'Thématiques',
      size: 300,
      cell: ({ row }) => {
        const soignant = row.original
        const soignantThematics = thematics
          .filter((t) => t.soignants.some((s) => s.id === soignant.id))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        const visible = soignantThematics.slice(0, 3)
        const rest = soignantThematics.length - visible.length
        return (
          <div className="flex items-center gap-1 overflow-hidden">
            {visible.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {t.name}
              </span>
            ))}
            {rest > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                +{rest}
              </span>
            )}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'comptes',
      header: 'Comptes',
      size: 220,
      cell: ({ row }) => {
        const comptes = members.filter((m) => m.soignantId === row.original.id).map(nomDuCompte)
        return comptes.length > 0 ? (
          <span className="text-sm text-text-dark">{comptes.join(', ')}</span>
        ) : (
          <span className="text-sm text-text-light">—</span>
        )
      },
    }),
  ]

  if (!canManage) {
    return columns
  }

  return [
    ...columns,
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 60,
      meta: { align: 'right' },
      cell: ({ row }) => {
        const soignant = row.original
        return (
          <div className="flex justify-end gap-2">
            <EditSoignantAccountsForm soignant={soignant} members={members} />
            <EditSoignantThematicsForm
              soignant={soignant}
              thematics={thematics}
              thematicOptions={thematicOptions}
            />
            <DeleteSoignantForm
              soignant={soignant}
              trigger={
                <Button variant="outline" size="icon" aria-label={`Supprimer ${soignant.name}`}>
                  <Trash className="w-4 h-4 text-destructive" />
                </Button>
              }
            />
          </div>
        )
      },
    }),
  ]
}

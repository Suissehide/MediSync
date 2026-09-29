import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'

import { CopyableId } from '../components/custom/copyableId.tsx'
import type { EstablishmentListItem } from '../types/superAdmin.ts'

const columnHelper = createColumnHelper<EstablishmentListItem>()

const StatutBadge = ({ deactivatedAt }: { deactivatedAt: string | null }) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium whitespace-nowrap ${
      deactivatedAt !== null
        ? 'bg-gray-100 text-gray-600 border border-gray-200'
        : 'bg-green-50 text-green-700 border border-green-200'
    }`}
  >
    {deactivatedAt !== null ? 'Désactivé' : 'Actif'}
  </span>
)

// Colonnes de la liste des établissements (spec §3.3, task-12-brief.md,
// step 1) : une par clé exacte de `establishmentListItemSchema` (voir
// `back/src/main/interfaces/http/fastify/schemas/establishment.schema.ts`),
// plus l'identifiant copiable exigé par le brief.
export const superAdminEstablishmentColumns = [
  columnHelper.display({
    id: 'id',
    header: 'Identifiant',
    size: 220,
    cell: ({ row }) => <CopyableId value={row.original.id} />,
  }),
  columnHelper.accessor('name', {
    header: 'Établissement',
  }),
  columnHelper.display({
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => (
      <StatutBadge deactivatedAt={row.original.deactivatedAt} />
    ),
  }),
  columnHelper.accessor('serviceCount', {
    header: 'Services',
  }),
  columnHelper.accessor('accountCount', {
    header: 'Comptes',
  }),
  columnHelper.accessor('patientCount', {
    header: 'Patients',
  }),
  columnHelper.display({
    id: 'firstAdmin',
    header: 'Premier administrateur',
    cell: ({ row }) => {
      const admin = row.original.firstAdmin
      if (!admin) {
        return <span className="text-text-light">—</span>
      }
      const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ')
      return name ? `${name} (${admin.email})` : admin.email
    },
  }),
  columnHelper.accessor('createdAt', {
    header: 'Créé le',
    cell: (info) => dayjs.utc(info.getValue()).format('DD/MM/YYYY'),
  }),
  columnHelper.accessor('lastActivityAt', {
    header: 'Dernière activité',
    cell: (info) => {
      const value = info.getValue()
      return value ? dayjs.utc(value).format('DD/MM/YYYY HH:mm') : '—'
    },
  }),
]

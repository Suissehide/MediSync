import { createColumnHelper } from '@tanstack/react-table'
import { Ban, RotateCcw, Trash } from 'lucide-react'

import EditMemberForm from '../components/custom/popup/editMemberForm.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_LABEL,
} from '../constants/member.constant.ts'
import type { EstablishmentRole } from '../types/auth.ts'
import type { Member } from '../types/member.ts'
import type { Soignant } from '../types/soignant.ts'

const columnHelper = createColumnHelper<Member>()

const ESTABLISHMENT_ROLE_STYLE: Record<EstablishmentRole, string> = {
  ADMIN: 'bg-red-50 text-red-700 border border-red-200',
  MEMBER: 'bg-blue-50 text-blue-700 border border-blue-200',
}

const RoleBadge = ({
  label,
  className,
}: {
  label: string
  className: string
}) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium whitespace-nowrap ${className}`}
  >
    {label}
  </span>
)

type MemberColumnOptions = {
  // Le service du contexte courant : cette étape ne montre (et ne modifie)
  // que le rôle du membre dans cet unique service, pas dans les autres
  // auxquels il pourrait être affecté (multi-service : étape 2).
  serviceId: string
  soignants: Soignant[]
  onToggleActive: (member: Member) => void
  onRemove: (member: Member) => void
  // Un seul jeu de mutations sert toutes les lignes : on ne veut faire
  // tourner l'icône de chargement que sur la ligne réellement concernée.
  isToggling: (member: Member) => boolean
}

export const getMemberColumns = ({
  serviceId,
  soignants,
  onToggleActive,
  onRemove,
  isToggling,
}: MemberColumnOptions) => [
  columnHelper.display({
    id: 'firstName',
    header: 'Prénom',
    cell: ({ row }) => row.original.user.firstName ?? '—',
  }),
  columnHelper.display({
    id: 'lastName',
    header: 'Nom',
    cell: ({ row }) => row.original.user.lastName ?? '—',
  }),
  columnHelper.display({
    id: 'email',
    header: 'Email',
    cell: ({ row }) => row.original.user.email,
  }),
  columnHelper.display({
    id: 'establishmentRole',
    header: 'Rôle établissement',
    cell: ({ row }) => (
      <RoleBadge
        label={ESTABLISHMENT_ROLE_LABEL[row.original.role]}
        className={ESTABLISHMENT_ROLE_STYLE[row.original.role]}
      />
    ),
  }),
  columnHelper.display({
    id: 'serviceRole',
    header: 'Rôle service',
    cell: ({ row }) => {
      const assignment = row.original.serviceMemberships.find(
        (membership) => membership.serviceId === serviceId,
      )
      if (!assignment) {
        return <span className="text-text-light">—</span>
      }
      return (
        <RoleBadge
          label={SERVICE_ROLE_LABEL[assignment.role]}
          className="bg-primary/10 text-primary border border-primary/20"
        />
      )
    },
  }),
  columnHelper.display({
    id: 'soignant',
    header: 'Fonction',
    cell: ({ row }) => {
      const soignant = soignants.find((s) => s.id === row.original.soignantId)
      return soignant?.name ?? '—'
    },
  }),
  columnHelper.display({
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const deactivated = row.original.user.deactivatedAt !== null
      return (
        <RoleBadge
          label={deactivated ? 'Désactivé' : 'Actif'}
          className={
            deactivated
              ? 'bg-gray-100 text-gray-600 border border-gray-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }
        />
      )
    },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    size: 140,
    meta: { align: 'right' },
    cell: ({ row }) => {
      const member = row.original
      const deactivated = member.user.deactivatedAt !== null
      return (
        <div className="flex justify-end gap-2">
          <EditMemberForm member={member} serviceId={serviceId} />
          <Button
            variant="outline"
            size="icon"
            onClick={() => onToggleActive(member)}
            isLoading={isToggling(member)}
            title={deactivated ? 'Réactiver le compte' : 'Désactiver le compte'}
          >
            {deactivated ? (
              <RotateCcw className="w-4 h-4" />
            ) : (
              <Ban className="w-4 h-4 text-orange-600" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onRemove(member)}
            title="Retirer le membre"
          >
            <Trash className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      )
    },
  }),
]

import { createColumnHelper } from '@tanstack/react-table'
import { Ban, RotateCcw, Trash } from 'lucide-react'

import { CopyableId } from '../components/custom/copyableId.tsx'
import EditMemberForm from '../components/custom/popup/editMemberForm.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_LABEL,
} from '../constants/member.constant.ts'
import type { EstablishmentRole } from '../types/auth.ts'
import type { Member } from '../types/member.ts'
import type { Service } from '../types/service.ts'

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

// Statut d'un compte, partage avec la liste des membres du service.
export const StatutBadge = ({
  deactivatedAt,
}: {
  deactivatedAt: string | null
}) => (
  <RoleBadge
    label={deactivatedAt !== null ? 'Désactivé' : 'Actif'}
    className={
      deactivatedAt !== null
        ? 'bg-gray-100 text-gray-600 border border-gray-200'
        : 'bg-green-50 text-green-700 border border-green-200'
    }
  />
)

type MemberColumnOptions = {
  // Tâche 14b (tour de correction 1, Important n°2) : la liste COMPLÈTE des
  // services de l'établissement courant (`GET /e/:establishmentId/admin/
  // services`, même requête qu'`EditMemberForm`) — sert à résoudre le NOM
  // d'un service à partir de `serviceMemberships[].serviceId`. Avant cette
  // tâche, la colonne « Rôle service » ne montrait que le rôle dans le
  // service d'un CONTEXTE qui n'existe jamais sur cet écran (toujours
  // `null`) : elle affichait donc systématiquement « — », y compris pour un
  // membre réellement affecté — un geste comblé mais invisible ailleurs que
  // dans la popup d'édition.
  services: Service[]
  onToggleActive: (member: Member) => void
  onRemove: (member: Member) => void
  // Un seul jeu de mutations sert toutes les lignes : on ne veut faire
  // tourner l'icône de chargement que sur la ligne réellement concernée.
  isToggling: (member: Member) => boolean
}

export const getMemberColumns = ({
  services,
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
  // Revue finale de l'étape 4a, Important n°3 : « identifiants copiables »
  // (decisions-etape-4a.md, D3/D4) — le geste de dépannage réel, « donne-moi
  // l'identifiant de ce compte ». L'identifiant du COMPTE (`user.id`), pas
  // celui du rattachement (`Member.id`) : c'est le même que celui affiché
  // par la recherche de comptes du super-admin (`accountSearchPanel.tsx`),
  // qui recoupe par la même donnée.
  columnHelper.display({
    id: 'accountId',
    header: 'Identifiant',
    cell: ({ row }) => <CopyableId value={row.original.user.id} />,
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
      const assignments = row.original.serviceMemberships
      if (assignments.length === 0) {
        return <span className="text-text-light">—</span>
      }
      // Une affectation par service (multi-service, un rôle par service —
      // `ServiceMembership`, back/prisma/schema.prisma) : toutes montrées,
      // jamais une seule au hasard. Le nom du service est résolu par
      // `services` (liste complète de l'établissement) ; un service absent
      // de cette liste (chargement en cours, ou tout autre écart, voir
      // `editMemberForm.tsx#buildServiceAssignments`) affiche quand même le
      // rôle, sans faire disparaître l'affectation.
      return (
        <div className="flex flex-wrap gap-1">
          {assignments.map((assignment) => {
            const service = services.find((s) => s.id === assignment.serviceId)
            const label = service
              ? `${service.name} : ${SERVICE_ROLE_LABEL[assignment.role]}`
              : SERVICE_ROLE_LABEL[assignment.role]
            return (
              <RoleBadge
                key={assignment.serviceId}
                label={label}
                className="bg-primary/10 text-primary border border-primary/20"
              />
            )
          })}
        </div>
      )
    },
  }),
  columnHelper.display({
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => (
      <StatutBadge deactivatedAt={row.original.user.deactivatedAt} />
    ),
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
          <EditMemberForm member={member} />
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

import { createColumnHelper } from '@tanstack/react-table'
import { Ban, RotateCcw, Trash } from 'lucide-react'

import { CopyableId } from '../components/custom/copyableId.tsx'
import EditMemberForm from '../components/custom/popup/editMemberForm.tsx'
import {
  Etiquette,
  EtiquetteStatut,
  type TonEtiquette,
} from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_LABEL,
} from '../constants/member.constant.ts'
import type { EstablishmentRole } from '../types/auth.ts'
import type { Member } from '../types/member.ts'
import type { Service } from '../types/service.ts'

const columnHelper = createColumnHelper<Member>()

const ESTABLISHMENT_ROLE_TON: Record<EstablishmentRole, TonEtiquette> = {
  ADMIN: 'danger',
  MEMBER: 'primaire',
}

type MemberColumnOptions = {
  // La liste COMPLÈTE des
  // services de l'établissement courant (`GET /e/:establishmentId/admin/
  // services`, même requête qu'`EditMemberForm`) — sert à résoudre le NOM
  // d'un service à partir de `serviceMemberships[].serviceId`. Auparavant,
  // la colonne « Rôle service » ne montrait que le rôle dans le
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
  // L'identifiant du compte n'est montre qu'au super-admin (2026-09-30).
  avecIdentifiant: boolean
}

export const getMemberColumns = ({
  services,
  onToggleActive,
  onRemove,
  isToggling,
  avecIdentifiant,
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
  // « Identifiants copiables » — le geste de dépannage réel, « donne-moi
  // l'identifiant de ce compte ». L'identifiant du COMPTE (`user.id`), pas
  // celui du rattachement (`Member.id`) : c'est le même que celui affiché
  // par la recherche de comptes du super-admin (`accountSearchPanel.tsx`),
  // qui recoupe par la même donnée.
  // Reserve au super-admin depuis le 2026-09-30, comme sur les membres du service.
  ...(avecIdentifiant
    ? [
        columnHelper.display({
          id: 'accountId',
          header: 'Identifiant',
          cell: ({ row }) => <CopyableId value={row.original.user.id} />,
        }),
      ]
    : []),
  columnHelper.display({
    id: 'establishmentRole',
    header: 'Rôle établissement',
    cell: ({ row }) => (
      <Etiquette ton={ESTABLISHMENT_ROLE_TON[row.original.role]}>
        {ESTABLISHMENT_ROLE_LABEL[row.original.role]}
      </Etiquette>
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
            return <Etiquette key={assignment.serviceId}>{label}</Etiquette>
          })}
        </div>
      )
    },
  }),
  columnHelper.display({
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => (
      <EtiquetteStatut
        deactivatedAt={row.original.user.deactivatedAt}
        invitationPending={row.original.user.invitationPending}
      />
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

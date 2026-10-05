import { createColumnHelper } from '@tanstack/react-table'
import { Trash } from 'lucide-react'

import { CopyableId } from '../components/custom/copyableId.tsx'
import EditServiceMemberForm from '../components/custom/popup/editServiceMemberForm.tsx'
import { nomDuCompte } from '../components/custom/popup/editSoignantAccountsForm.tsx'
import { Etiquette, EtiquetteStatut } from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
import { SERVICE_ROLE_LABEL } from '../constants/member.constant.ts'
import type { ServiceMember } from '../types/serviceMember.ts'
import type { Soignant } from '../types/soignant.ts'

const columnHelper = createColumnHelper<ServiceMember>()

type ServiceMemberColumnOptions = {
  soignants: Soignant[]
  // L'identifiant du compte, pour le super-admin seulement (diagnostic, recoupement avec les
  // journaux de la plateforme).
  avecIdentifiant: boolean
  // Le compte connecte : le back refuse qu'un coordinateur se retrograde ou se retire lui-meme
  // (`assertOtherServiceMember`), l'ecran n'offre donc pas le geste.
  soiMeme: string | undefined
  onRemove: (member: ServiceMember) => void
}

// Membres du service courant. Le role DANS CE SERVICE et le retrait du service se gerent ici par
// son coordinateur ; les comptes, le rattachement d'etablissement et les autres services restent
// a l'administration de l'etablissement, le soignant incarne sur l'ecran Soignants.
export const getServiceMemberColumns = ({
  soignants,
  avecIdentifiant,
  soiMeme,
  onRemove,
}: ServiceMemberColumnOptions) => [
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
    id: 'nom',
    header: 'Nom',
    cell: ({ row }) => nomDuCompte(row.original),
  }),
  columnHelper.display({
    id: 'email',
    header: 'Email',
    cell: ({ row }) => row.original.user.email,
  }),
  columnHelper.display({
    id: 'role',
    header: 'Rôle',
    cell: ({ row }) => (
      <Etiquette>{SERVICE_ROLE_LABEL[row.original.role]}</Etiquette>
    ),
  }),
  columnHelper.display({
    id: 'soignant',
    header: 'Soignant',
    cell: ({ row }) =>
      soignants.find((s) => s.id === row.original.soignantId)?.name ?? (
        <span className="text-text-light">—</span>
      ),
  }),
  columnHelper.display({
    id: 'statut',
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
    size: 100,
    meta: { align: 'right' },
    cell: ({ row }) => {
      const membre = row.original
      if (membre.user.id === soiMeme) {
        return <span className="text-text-light">—</span>
      }
      return (
        <div className="flex justify-end gap-2">
          <EditServiceMemberForm member={membre} />
          <Button
            variant="outline"
            size="icon"
            onClick={() => onRemove(membre)}
            title="Retirer du service"
          >
            <Trash className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      )
    },
  }),
]

import { createColumnHelper } from '@tanstack/react-table'

import { CopyableId } from '../components/custom/copyableId.tsx'
import { nomDuCompte } from '../components/custom/popup/editSoignantAccountsForm.tsx'
import { Etiquette, EtiquetteStatut } from '../components/table/etiquette.tsx'
import { SERVICE_ROLE_LABEL } from '../constants/member.constant.ts'
import type { ServiceMember } from '../types/serviceMember.ts'
import type { Soignant } from '../types/soignant.ts'

const columnHelper = createColumnHelper<ServiceMember>()

// Membres du service courant, en lecture : les comptes, leurs roles et affectations se gerent a
// l'administration de l'etablissement ; le soignant incarne, sur l'ecran Soignants.
// `avecIdentifiant` : l'identifiant du compte, pour le super-admin seulement (diagnostic, recoupement
// avec les journaux de la plateforme).
export const getServiceMemberColumns = (
  soignants: Soignant[],
  avecIdentifiant: boolean,
) => [
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
      <EtiquetteStatut deactivatedAt={row.original.user.deactivatedAt} />
    ),
  }),
]

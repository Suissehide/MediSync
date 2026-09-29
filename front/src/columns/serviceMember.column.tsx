import { createColumnHelper } from '@tanstack/react-table'

import { nomDuCompte } from '../components/custom/popup/editSoignantAccountsForm.tsx'
import { SERVICE_ROLE_LABEL } from '../constants/member.constant.ts'
import type { ServiceMember } from '../types/serviceMember.ts'
import type { Soignant } from '../types/soignant.ts'

const columnHelper = createColumnHelper<ServiceMember>()

// Membres du service courant, en lecture : les comptes, leurs roles et affectations se gerent a
// l'administration de l'etablissement ; le soignant incarne, sur l'ecran Soignants.
export const getServiceMemberColumns = (soignants: Soignant[]) => [
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
    cell: ({ row }) => SERVICE_ROLE_LABEL[row.original.role],
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
    cell: ({ row }) =>
      row.original.user.deactivatedAt !== null ? (
        <span className="text-text-light">Désactivé</span>
      ) : (
        'Actif'
      ),
  }),
]

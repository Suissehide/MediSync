import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { ShieldAlert } from 'lucide-react'

import { CopyableId } from '../components/custom/copyableId.tsx'
import { Etiquette } from '../components/table/etiquette.tsx'
import { superAdminAccessLogActionLabels } from '../constants/superAdminAccessLog.constant.ts'
import type { EstablishmentListItem } from '../types/superAdmin.ts'
import type {
  SuperAdminAccessLogEntry,
  SuperAdminAccessLogSource,
} from '../types/superAdminAccessLog.ts'

const columnHelper = createColumnHelper<SuperAdminAccessLogEntry>()

type ColumnOptions = {
  source: SuperAdminAccessLogSource
  // Résout `establishmentId` en nom lisible : la liste vient déjà de
  // `useSuperAdminEstablishmentsQuery` (l'écran des établissements), aucune requête
  // supplémentaire n'est nécessaire pour ce seul affichage.
  establishments: Pick<EstablishmentListItem, 'id' | 'name'>[]
}

// CE QUE CET ÉCRAN MONTRE — deux jeux de colonnes, choisis par `source`,
// jamais les deux à la fois (même parti pris que le schéma back : les champs propres à une
// source et absents de l'autre ne se rendent pas comme des cellules vides sur l'autre journal).
//
// `accesParOctroi` (colonne « Origine », uniquement sur `acces`) reprend EXACTEMENT le rendu de
// `columns/accessLog.column.tsx` : l'anomalie qu'un super-admin cherche sur ce journal doit
// sauter aux yeux, pas se fondre dans une colonne booléenne banale (« Oui »/« Non » sur chaque
// ligne) — un accès réel (`false`) ne rend rien, un accès par octroi (`true`) rend un badge ambré
// nommé.
//
// `establishmentId`/`serviceId` NULS ne sont pas un défaut d'affichage : ce sont les lignes du
// script d'amorçage (`UserDomain.bootstrapSuperAdmin`, sous `runAsSystem`), qu'AUCUNE autre route
// ne pouvait lire avant cette tâche (voir `routes/super-admin/access-log.ts`, back) — elles se
// distinguent explicitement plutôt que de laisser une cellule vide ambiguë.
export const getSuperAdminAccessLogColumns = ({
  source,
  establishments,
}: ColumnOptions) => {
  const actionLabels = superAdminAccessLogActionLabels(source)

  const base = [
    columnHelper.accessor('createdAt', {
      header: 'Date',
      cell: (info) => dayjs.utc(info.getValue()).format('DD/MM/YYYY'),
      size: 100,
    }),
    columnHelper.accessor((row) => dayjs.utc(row.createdAt).format('HH:mm'), {
      id: 'time',
      header: 'Heure',
      size: 70,
    }),
    columnHelper.accessor(
      (row) =>
        row.establishmentId
          ? (establishments.find((e) => e.id === row.establishmentId)?.name ??
            row.establishmentId)
          : null,
      {
        id: 'establishment',
        header: 'Établissement',
        size: 170,
        cell: (info) =>
          info.getValue() ?? (
            <span className="italic text-text-light">
              Amorçage (aucun établissement)
            </span>
          ),
      },
    ),
    columnHelper.accessor(
      (row) =>
        row.userFirstName || row.userLastName
          ? `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim()
          : row.userID.slice(0, 8),
      {
        id: 'account',
        header: 'Compte',
        size: 180,
      },
    ),
    columnHelper.accessor('action', {
      header: 'Action',
      cell: (info) => actionLabels[info.getValue()] ?? info.getValue(),
      size: 220,
    }),
  ]

  if (source === 'acces') {
    return [
      ...base,
      columnHelper.accessor('patientId', {
        id: 'patientId',
        header: 'Dossier (id)',
        size: 150,
        cell: (info) => {
          const value = info.getValue()
          return value ? <CopyableId value={value} /> : null
        },
      }),
      columnHelper.accessor('accesParOctroi', {
        id: 'accesParOctroi',
        header: 'Origine',
        size: 180,
        cell: (info) => {
          if (!info.getValue()) {
            return null
          }
          return (
            <Etiquette ton="alerte">
              <ShieldAlert className="w-3 h-3" />
              Accès par octroi
            </Etiquette>
          )
        },
      }),
    ]
  }

  return [
    ...base,
    columnHelper.accessor(
      (row) =>
        row.entityType ? `${row.entityType} · ${row.entityID ?? ''}` : null,
      {
        id: 'entity',
        header: 'Entité',
        size: 220,
        cell: (info) => info.getValue() ?? '—',
      },
    ),
  ]
}

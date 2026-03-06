import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'

import { ACTION_LABELS } from '../constants/activityLog.constant.ts'
import type { ActivityLog } from '../types/activityLog.ts'

const columnHelper = createColumnHelper<ActivityLog>()

export const activityLogColumns = [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) => dayjs(info.getValue()).format('DD/MM/YYYY'),
    size: 110,
  }),
  columnHelper.accessor((row) => dayjs(row.createdAt).format('HH:mm'), {
    id: 'time',
    header: 'Heure',
    size: 80,
  }),
  columnHelper.accessor(
    (row) =>
      row.userFirstName || row.userLastName
        ? `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim()
        : row.userID.slice(0, 8),
    {
      id: 'user',
      header: 'Utilisateur',
      size: 180,
    },
  ),
  columnHelper.accessor('action', {
    header: 'Action',
    cell: (info) => ACTION_LABELS[info.getValue()] ?? info.getValue(),
    size: 240,
  }),
  columnHelper.accessor('entityType', {
    header: 'Type',
    size: 140,
  }),
  columnHelper.accessor((row) => row.entityID.slice(0, 8) + '…', {
    id: 'entityID',
    header: 'Identifiant',
    size: 120,
    meta: { headerClass: 'text-text-light' },
  }),
]

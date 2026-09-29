import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'

import { Etiquette } from '../components/table/etiquette.tsx'
import {
  ACTION_LABELS,
  TYPE_LABELS,
} from '../constants/activityLog.constant.ts'
import type { ActivityLog } from '../types/activityLog.ts'

const columnHelper = createColumnHelper<ActivityLog>()

export const activityLogColumns = [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) => dayjs.utc(info.getValue()).format('DD/MM/YYYY'),
    size: 110,
  }),
  columnHelper.accessor((row) => dayjs.utc(row.createdAt).format('HH:mm'), {
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
    cell: (info) => {
      const label = TYPE_LABELS[info.getValue()] ?? info.getValue()
      return <Etiquette>{label}</Etiquette>
    },
  }),
]

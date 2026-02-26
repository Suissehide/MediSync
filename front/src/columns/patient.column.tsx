import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import type { Patient } from '../types/patient.ts'

const columnHelper = createColumnHelper<Patient>()

type PatientActions = {
  onView: (id: string) => void
}

export const getPatientColumns = ({ onView }: PatientActions) => {
  return [
    columnHelper.accessor('firstName', {
      header: 'Prénom',
    }),
    columnHelper.accessor('lastName', {
      header: 'Nom',
    }),
    columnHelper.accessor(
      (row) => (row.entryDate ? dayjs(row.entryDate).format('DD/MM/YYYY') : ''),
      {
        id: 'entryDate',
        header: "Date d'entrée",
      },
    ),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 50,
      meta: {
        align: 'right',
      },
      cell: ({ row }) => {
        const patient = row.original
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onView(patient.id)}
            >
              <Eye className="w-3 h-3" />
            </Button>
          </div>
        )
      },
    }),
  ]
}

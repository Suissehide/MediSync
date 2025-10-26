import { createColumnHelper } from '@tanstack/react-table'
import type { Patient } from '../types/patient.ts'
import dayjs from 'dayjs'
import { Button } from '../components/ui/button.tsx'
import { Pen, Trash } from 'lucide-react'

const columnHelper = createColumnHelper<Patient>()

export const getPatientColumns = () => {
  return [
    columnHelper.accessor('firstName', {
      header: 'Prénom',
    }),
    columnHelper.accessor('lastName', {
      header: 'Nom',
    }),
    columnHelper.accessor((row) => dayjs(row.entryDate).format('DD/MM/YYYY'), {
      id: 'entryDate',
      header: "Date d'entrée",
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const patient = row.original
        return (
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Pen className="w-4 h-4" />
            </Button>
            <Button variant="destructive" size="sm">
              <Trash className="w-4 h-4" />
            </Button>
          </div>
        )
      },
    }),
  ]
}

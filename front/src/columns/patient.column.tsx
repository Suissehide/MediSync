import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import type { PatientWithTags } from '../types/patient.ts'

const columnHelper = createColumnHelper<PatientWithTags>()

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
    columnHelper.accessor('pathwayTemplateTags', {
      id: 'pathwayTemplateTags',
      header: 'Parcours',
      cell: ({ getValue }) => {
        const tags = getValue() ?? []
        if (tags.length === 0) {
          return null
        }
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary leading-none"
              >
                {tag}
              </span>
            ))}
          </div>
        )
      },
    }),
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

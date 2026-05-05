import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { AlertTriangle, Eye } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import { getContrastTextColor, hexToRGBA } from '../libs/color.ts'
import type { PathwayTemplate } from '../types/pathwayTemplate.ts'
import type { PatientWithTags } from '../types/patient.ts'

const columnHelper = createColumnHelper<PatientWithTags>()

type PatientActions = {
  onView: (id: string) => void
  pathwayTemplates?: PathwayTemplate[]
}

export const getPatientColumns = ({
  onView,
  pathwayTemplates = [],
}: PatientActions) => {
  const tagColorMap = new Map<string, string>()
  for (const template of pathwayTemplates) {
    for (const tag of template.tags ?? []) {
      if (!tagColorMap.has(tag)) {
        tagColorMap.set(tag, template.color)
      }
    }
  }

  return [
    columnHelper.display({
      id: 'enrollmentAlert',
      header: '',
      size: 32,
      cell: ({ row }) => {
        const count = row.original.enrollmentIssues?.length ?? 0
        if (count === 0) {
          return null
        }
        return (
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-700 leading-none">
              <AlertTriangle className="w-2.5 h-2.5" />
              {count}
            </span>
          </div>
        )
      },
    }),
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
            {tags.map((tag) => {
              const color = tagColorMap.get(tag)
              return (
                <span
                  key={tag}
                  className="inline-block px-2 py-1 rounded-md text-[10px] font-medium leading-none"
                  style={
                    color
                      ? {
                          backgroundColor: hexToRGBA(color, 0.4),
                          color: getContrastTextColor(color),
                          border: `1px solid ${hexToRGBA(color, 0.8)}`,
                        }
                      : {
                          backgroundColor: 'hsl(var(--muted))',
                          color: 'hsl(var(--muted-foreground))',
                          border: '1px solid hsl(var(--border))',
                        }
                  }
                >
                  {tag}
                </span>
              )
            })}
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

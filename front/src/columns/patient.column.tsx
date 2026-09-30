import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { AlertTriangle, Eye } from 'lucide-react'

import { Etiquette } from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
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
  // Couleur d'un tag principal : celle du premier parcours qui le porte.
  const tagColorMap = new Map<string, string>()
  for (const template of pathwayTemplates) {
    if (!tagColorMap.has(template.mainTag)) {
      tagColorMap.set(template.mainTag, template.color)
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
            <Etiquette ton="alerte">
              <AlertTriangle className="w-3 h-3" />
              {count}
            </Etiquette>
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
    // `entryDate` a quitté `Patient` pour le sous-dossier de service (`PatientServiceFile`,
    // `types/patientServiceFile.ts`), mais `GET /patient/with-tags`
    // joint déjà ce sous-dossier filtré sur le service courant et l'aplatit sur la ligne (back)
    // : la colonne se lit donc sur `PatientWithTags.entryDate`, comme avant.
    columnHelper.accessor(
      (row) =>
        row.entryDate ? dayjs.utc(row.entryDate).format('DD/MM/YYYY') : '',
      {
        id: 'entryDate',
        header: "Date d'entrée",
      },
    ),
    columnHelper.accessor('pathwayTemplateTags', {
      id: 'pathwayTemplateTags',
      header: 'Parcours',
      size: 250,
      maxSize: 250,
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
                <Etiquette key={tag} couleur={color} ton="neutre">
                  {tag}
                </Etiquette>
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

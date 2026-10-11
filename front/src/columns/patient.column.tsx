import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { AlertTriangle, Eye } from 'lucide-react'
import { useState } from 'react'

import {
  type Choice,
  choiceColumn,
  multiChoiceColumn,
} from '../components/table/choiceColumn.tsx'
import { Etiquette } from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  fieldValue,
  formatFieldValue,
} from '../constants/serviceFieldTypes.tsx'
import type { PatientWithTags } from '../types/patient.ts'
import type {
  ServiceField,
  ServiceFieldCategory,
} from '../types/serviceField.ts'

const columnHelper = createColumnHelper<PatientWithTags>()

// Etiquettes de parcours affichees avant le bouton de depliage : au-dela, la cellule tenait
// sur plusieurs lignes et faisait grandir toute la ligne du tableau.
const PARCOURS_REPLIES = 2

// Composant et non une fonction appelee dans `cell` : l'etat de depliage doit survivre aux
// rendus de `getPatientColumns`, qui recree les colonnes a chaque rendu de la page.
export function CelluleParcours({
  tags,
  couleurParTag,
}: {
  tags: string[]
  couleurParTag: Record<string, string>
}) {
  const [deploye, setDeploye] = useState(false)
  const caches = tags.length - PARCOURS_REPLIES
  const visibles = deploye ? tags : tags.slice(0, PARCOURS_REPLIES)

  return (
    <div className="flex flex-wrap gap-1">
      {visibles.map((tag) => (
        <Etiquette key={tag} couleur={couleurParTag[tag]} ton="neutre">
          {tag}
        </Etiquette>
      ))}
      {caches > 0 && (
        <Etiquette asChild ton="neutre">
          <button
            type="button"
            // `stopPropagation` : la ligne entiere ouvre la fiche du patient (`onRowClick`).
            onClick={(event) => {
              event.stopPropagation()
              setDeploye((ouvert) => !ouvert)
            }}
            aria-expanded={deploye}
            className="cursor-pointer hover:bg-gray-200"
          >
            {deploye ? 'Réduire' : `+${caches}`}
          </button>
        </Etiquette>
      )}
    </div>
  )
}

type PatientActions = {
  onView: (id: string) => void
  fields: ServiceField[]
  categories: ServiceFieldCategory[]
  canReadClinical: boolean
}

const BOOLEAN_CHOICES: Choice[] = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
]

// Une colonne optionnelle par champ configurable actif, texte long exclu (absent de la liste).
const fieldColumn = (f: ServiceField, group: string) => {
  const label = f.label
  // Choix archivés après les actifs : ils servent encore à libeller les anciennes valeurs.
  const choices = [
    ...f.choices.filter((c) => !c.archived),
    ...f.choices.filter((c) => c.archived),
  ].map((c) => ({ value: c.key, label: c.label }))
  const value = (row: PatientWithTags) => fieldValue(f, row)

  switch (f.type) {
    case 'choice':
      return choiceColumn<PatientWithTags>(
        f.key,
        (row) => {
          const v = value(row)
          return typeof v === 'string' ? v : undefined
        },
        { label, group, choices },
      )
    case 'multichoice':
      return multiChoiceColumn<PatientWithTags>(
        f.key,
        (row) => {
          const v = value(row)
          return Array.isArray(v) ? v.map(String) : undefined
        },
        { label, group, choices },
      )
    case 'boolean':
      return choiceColumn<PatientWithTags>(
        f.key,
        (row) => {
          const v = value(row)
          return typeof v === 'boolean' ? String(v) : undefined
        },
        { label, group, choices: BOOLEAN_CHOICES },
      )
    default:
      return columnHelper.accessor(
        (row) => {
          const v = value(row)
          return typeof v === 'number' || typeof v === 'string' ? v : undefined
        },
        {
          id: f.key,
          header: label,
          sortUndefined: 'last',
          cell: ({ getValue }) => formatFieldValue(f, getValue()),
          meta: { optional: { label, group } },
        },
      )
  }
}

const exitDateColumn = (group: string) =>
  columnHelper.accessor((row) => row.exitDate ?? undefined, {
    id: 'exitDate',
    header: 'Date de sortie',
    sortUndefined: 'last',
    cell: ({ getValue }) => {
      const value = getValue()
      return value ? dayjs.utc(value).format('DD/MM/YYYY') : null
    },
    meta: { optional: { label: 'Date de sortie', group } },
  })

export const getPatientColumns = ({
  onView,
  fields,
  categories,
  canReadClinical,
}: PatientActions) => {
  const listed = fields
    .filter(
      (f) =>
        !f.archived &&
        f.type !== 'longtext' &&
        (canReadClinical || !f.clinical),
    )
    .sort((a, b) => a.order - b.order)
  // Colonnes de chaque catégorie active, dans l'ordre ; la date de sortie clôt la sienne.
  const categoryColumns = categories
    .filter((c) => !c.archived)
    .sort((a, b) => a.order - b.order)
    .flatMap((c) => [
      ...listed
        .filter((f) => f.categoryId === c.id)
        .map((f) => fieldColumn(f, c.label)),
      ...(c.dateField === 'exitDate' ? [exitDateColumn(c.label)] : []),
    ])

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
    columnHelper.accessor('lastName', {
      header: 'Nom',
    }),
    columnHelper.accessor('firstName', {
      header: 'Prénom',
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
      cell: ({ getValue, row }) => {
        const tags = getValue() ?? []
        if (tags.length === 0) {
          return null
        }

        return (
          <CelluleParcours
            tags={tags}
            couleurParTag={row.original.pathwayTagColors ?? {}}
          />
        )
      },
    }),
    ...categoryColumns,
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

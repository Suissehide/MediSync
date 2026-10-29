import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  ServiceField,
  ServiceFieldCategory,
} from '../types/serviceField.ts'
import { CelluleParcours, getPatientColumns } from './patient.column.tsx'

const couleurs: Record<string, string> = {}

const tags = ['asthme', 'BPCO', 'diabète', 'ETP', 'obésité']

describe('cellule des parcours', () => {
  it('replie au-dela de deux etiquettes et deplie au clic', async () => {
    render(<CelluleParcours tags={tags} couleurParTag={couleurs} />)

    expect(screen.getByText('asthme')).toBeTruthy()
    expect(screen.getByText('BPCO')).toBeTruthy()
    expect(screen.queryByText('diabète')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '+3' }))

    for (const tag of tags) {
      expect(screen.getByText(tag)).toBeTruthy()
    }

    await userEvent.click(screen.getByRole('button', { name: 'Réduire' }))
    expect(screen.queryByText('diabète')).toBeNull()
  })

  it("n'affiche aucun bouton quand tout tient", () => {
    render(
      <CelluleParcours tags={['asthme', 'BPCO']} couleurParTag={couleurs} />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  // La ligne du tableau ouvre la fiche du patient : deplier ne doit pas y naviguer.
  it('ne propage pas le clic a la ligne', async () => {
    const onRowClick = vi.fn()
    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <CelluleParcours tags={tags} couleurParTag={couleurs} />
            </td>
          </tr>
        </tbody>
      </table>,
    )

    await userEvent.click(screen.getByRole('button', { name: '+3' }))
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

const champ = (over: Partial<ServiceField>): ServiceField => ({
  id: over.key ?? 'f',
  key: 'f',
  label: 'F',
  type: 'text',
  categoryId: 'inclusion',
  order: 0,
  clinical: false,
  unit: null,
  archived: false,
  choices: [],
  ...over,
})

const champs: ServiceField[] = [
  champ({ key: 'sortie', type: 'choice', categoryId: 'bilan', order: 0 }),
  champ({ key: 'note', type: 'longtext', order: 1 }),
  champ({ key: 'ancien', type: 'text', order: 2, archived: true }),
  champ({ key: 'hba1c', type: 'number', order: 3 }),
  champ({ key: 'diag', type: 'choice', order: 0, clinical: true }),
  champ({ key: 'comorb', type: 'multichoice', order: 4 }),
  champ({ key: 'fumeur', type: 'boolean', order: 5 }),
  champ({ key: 'bilan', type: 'date', categoryId: 'bilan', order: 1 }),
  champ({ key: 'poids', type: 'number', categoryId: 'suivi', order: 0 }),
]

// Ordre du tableau volontairement différent de `order`, libellés renommés.
const categories: ServiceFieldCategory[] = [
  {
    id: 'bilan',
    label: 'Fin de prise en charge',
    order: 2,
    dateField: 'exitDate',
    archived: false,
  },
  { id: 'suivi', label: 'Suivi', order: 1, dateField: null, archived: false },
  {
    id: 'inclusion',
    label: 'Admission',
    order: 0,
    dateField: 'entryDate',
    archived: false,
  },
]

const colonnes = getPatientColumns({
  onView: () => undefined,
  fields: champs,
  categories,
  canReadClinical: true,
})

describe('colonnes optionnelles des patients', () => {
  it('une colonne par champ actif hors texte long, groupée sous le libellé de sa catégorie, catégories puis champs dans l ordre, date de sortie dans sa catégorie', () => {
    const optionnelles = colonnes
      .filter((c) => (c.meta as { optional?: unknown } | undefined)?.optional)
      .map((c) => [
        c.id,
        (c.meta as { optional: { group: string } }).optional.group,
      ])
    expect(optionnelles).toEqual([
      ['diag', 'Admission'],
      ['hba1c', 'Admission'],
      ['comorb', 'Admission'],
      ['fumeur', 'Admission'],
      ['poids', 'Suivi'],
      ['sortie', 'Fin de prise en charge'],
      ['bilan', 'Fin de prise en charge'],
      ['exitDate', 'Fin de prise en charge'],
    ])
  })

  it('ne genere pas de colonne clinique sans clinical:read', () => {
    const ids = getPatientColumns({
      onView: () => undefined,
      fields: champs,
      categories,
      canReadClinical: false,
    }).map((c) => c.id)
    expect(ids).not.toContain('diag')
    expect(ids).toContain('hba1c')
  })

  it('lit la valeur dans data ou clinicalData, le booleen en true/false', () => {
    const ligne = {
      id: 'p',
      firstName: 'A',
      lastName: 'B',
      pathwayTemplateTags: [],
      data: { hba1c: 7.2, fumeur: false },
      clinicalData: { diag: 'AVC' },
    }
    const valeur = (id: string) => {
      const colonne = colonnes.find((c) => c.id === id)
      const lire: unknown =
        colonne && 'accessorFn' in colonne ? colonne.accessorFn : undefined
      if (typeof lire !== 'function') {
        throw new Error(`colonne ${id} sans accessorFn`)
      }
      return lire(ligne, 0)
    }
    expect(valeur('hba1c')).toBe(7.2)
    expect(valeur('fumeur')).toBe('false')
    expect(valeur('diag')).toBe('AVC')
    expect(valeur('comorb')).toBeUndefined()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ServiceField } from '../types/serviceField.ts'
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
  section: 'pathway',
  order: 0,
  clinical: false,
  unit: null,
  archived: false,
  choices: [],
  ...over,
})

const champs: ServiceField[] = [
  champ({ key: 'sortie', type: 'choice', section: 'outcome', order: 0 }),
  champ({ key: 'note', type: 'longtext', order: 1 }),
  champ({ key: 'ancien', type: 'text', order: 2, archived: true }),
  champ({ key: 'hba1c', type: 'number', order: 3 }),
  champ({ key: 'diag', type: 'choice', order: 0, clinical: true }),
  champ({ key: 'comorb', type: 'multichoice', order: 4 }),
  champ({ key: 'fumeur', type: 'boolean', order: 5 }),
  champ({ key: 'bilan', type: 'date', section: 'outcome', order: 1 }),
]

const colonnes = getPatientColumns({
  onView: () => undefined,
  fields: champs,
  canReadClinical: true,
})

describe('colonnes optionnelles des patients', () => {
  it('une colonne par champ actif hors texte long, Inclusion puis Bilan, avant la date de sortie', () => {
    const optionnelles = colonnes
      .filter((c) => (c.meta as { optional?: unknown } | undefined)?.optional)
      .map((c) => [
        c.id,
        (c.meta as { optional: { group: string } }).optional.group,
      ])
    expect(optionnelles).toEqual([
      ['diag', 'Inclusion'],
      ['hba1c', 'Inclusion'],
      ['comorb', 'Inclusion'],
      ['fumeur', 'Inclusion'],
      ['sortie', 'Bilan'],
      ['bilan', 'Bilan'],
      ['exitDate', 'Bilan'],
    ])
  })

  it('ne genere pas de colonne clinique sans clinical:read', () => {
    const ids = getPatientColumns({
      onView: () => undefined,
      fields: champs,
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
      const colonne = colonnes.find((c) => c.id === id) as {
        accessorFn: (row: typeof ligne, index: number) => unknown
      }
      return colonne.accessorFn(ligne, 0)
    }
    expect(valeur('hba1c')).toBe(7.2)
    expect(valeur('fumeur')).toBe('false')
    expect(valeur('diag')).toBe('AVC')
    expect(valeur('comorb')).toBeUndefined()
  })
})

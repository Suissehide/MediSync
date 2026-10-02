import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CelluleParcours } from './patient.column.tsx'

const couleurs = new Map<string, string>()

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

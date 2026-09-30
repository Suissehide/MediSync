import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CopyableId } from './copyableId.tsx'

// « Les identifiants copiables » : le support a besoin de copier un
// identifiant (établissement, compte...) pour le recouper avec un
// journal ou une base — jamais de le saisir à la main.

describe('CopyableId', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("affiche l'identifiant et le copie au clic, sans naviguer", async () => {
    const onRowClick = vi.fn()

    render(
      // Reproduit la ligne de tableau cliquable réelle
      // (`virtualizedBodyTable.tsx` : un `<tr onClick={...}>` qui navigue
      // vers le détail), plutôt qu'un `<div>` qu'il faudrait ensuite faire
      // taire avec des règles a11y sans rapport avec ce qui est testé.
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <CopyableId value="cmt_abc123" />
            </td>
          </tr>
        </tbody>
      </table>,
    )

    expect(screen.getByText('cmt_abc123')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /copier/i }))

    expect(writeText).toHaveBeenCalledWith('cmt_abc123')
    // Le bouton vit dans une ligne de tableau cliquable (navigation vers le
    // détail) : le copier ne doit jamais déclencher cette navigation.
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

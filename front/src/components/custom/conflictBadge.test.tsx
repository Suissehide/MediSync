import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ConflictBadge } from './conflictBadge.tsx'

describe('ConflictBadge', () => {
  // Au clavier, sans souris : le détail doit apparaître au focus.
  it('montre le detail des conflits quand il recoit le focus', async () => {
    render(<ConflictBadge labels={['Bureau 7 déjà occupée 11:15–12:15']} />)

    await userEvent.tab()

    expect(
      await screen.findByRole('tooltip', {
        name: 'Bureau 7 déjà occupée 11:15–12:15',
      }),
    ).toBeInTheDocument()
  })

  it('ne rend rien sans conflit', () => {
    const { container } = render(<ConflictBadge labels={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

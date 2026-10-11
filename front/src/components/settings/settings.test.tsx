import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { IconButton } from './iconButton.tsx'
import { SettingsCard } from './settingsCard.tsx'
import { Tag } from './tag.tsx'

describe('composants des écrans de configuration', () => {
  it('IconButton : libellé en aria-label et title, désactivé sans déclencher le clic', async () => {
    const onClick = vi.fn()
    render(
      <IconButton label="Supprimer" danger disabled onClick={onClick}>
        x
      </IconButton>,
    )
    const bouton = screen.getByRole('button', { name: 'Supprimer' })
    expect(bouton).toHaveAttribute('title', 'Supprimer')
    expect(bouton).toBeDisabled()
    await userEvent.click(bouton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('Tag : variante neutre par défaut, primaire sur demande', () => {
    render(
      <>
        <Tag>Texte court</Tag>
        <Tag variant="primary">Clinique</Tag>
      </>,
    )
    expect(screen.getByText('Texte court')).toHaveClass('bg-muted')
    expect(screen.getByText('Clinique')).toHaveClass('text-primary-dark')
  })

  it('SettingsCard : le crayon ouvre l’édition, Entrée enregistre le libellé', async () => {
    const onRename = vi.fn()
    render(
      <SettingsCard
        title="Suivi"
        onRename={onRename}
        renameLabel="Renommer"
        inputLabel="Nom"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Renommer' }))
    const champ = screen.getByRole('textbox', { name: 'Nom' })
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Suivi 2{enter}')
    expect(onRename).toHaveBeenCalledWith('Suivi 2')
  })

  it('SettingsCard : la racine ne rétrécit pas dans la colonne qui défile', () => {
    render(<SettingsCard title="Suivi" />)
    expect(screen.getByRole('region', { name: 'Suivi' })).toHaveClass(
      'shrink-0',
    )
  })
})

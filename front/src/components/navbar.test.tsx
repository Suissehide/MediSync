import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SettingsMenu, type SettingsMenuProps } from './navbar.tsx'

// Aucune permission de service accordee par defaut : chaque test ne leve que
// celles dont il a besoin, pour ne jamais dependre d'un defaut permissif.
const AUCUNE_PERMISSION: Omit<SettingsMenuProps, 'establishmentId' | 'serviceId'> = {
  canPlanning: false,
  canManageSoignants: false,
  canManageReferentials: false,
  canManageLocations: false,
  canManageMembers: false,
  canReadActivityLog: false,
}

// Meme harnais minimal que `tenantSelector.test.tsx` : `SettingsMenu` n'a
// besoin que d'un `useRouter()` fonctionnel (pour `router.navigate` au clic,
// jamais declenche par ces tests, qui ne verifient que le rendu).
const renderSettingsMenu = (props: SettingsMenuProps) => {
  const rootRoute = createRootRoute({ component: () => <SettingsMenu {...props} /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('SettingsMenu', () => {
  // Verrou du constat reporte par la tache 12 : un administrateur sans
  // affectation de service (contexte `serviceId: null`, voir `admin.tsx`)
  // garde acces a l'ecran des membres — sa garde de route l'y autorise
  // explicitement (`members:manage`, permission d'etablissement, pas de
  // service) — et doit donc voir le lien correspondant dans ce menu.
  it('affiche le lien Membres pour un administrateur sans service en contexte', async () => {
    renderSettingsMenu({
      establishmentId: 'e1',
      serviceId: null,
      ...AUCUNE_PERMISSION,
      canManageMembers: true,
    })

    await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Membres')).toBeInTheDocument()
    // Aucun ecran de service n'a de destination valable sans service en
    // contexte : aucun ne doit apparaitre, meme si sa permission (de niveau
    // etablissement pour certains d'entre eux) etait accordee.
    expect(screen.queryByText('Planning')).not.toBeInTheDocument()
    expect(screen.queryByText('Activité')).not.toBeInTheDocument()
  })

  // Cas nominal : avec un service en contexte et toutes les permissions
  // accordees, Membres reste visible aux cotes des ecrans de service — le
  // verrou ci-dessus ne doit pas masquer Membres quand un service est present.
  it('affiche Membres aux cotes des ecrans de service quand un service est en contexte', async () => {
    renderSettingsMenu({
      establishmentId: 'e1',
      serviceId: 's1',
      canPlanning: true,
      canManageSoignants: true,
      canManageReferentials: true,
      canManageLocations: true,
      canManageMembers: true,
      canReadActivityLog: true,
    })

    await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Membres')).toBeInTheDocument()
    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('Activité')).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { LAST_CONTEXT_KEY } from '@/utils/tenant-context.ts'

import { Route } from './$serviceId.tsx'

const user: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR', soignantId: 'so1' }],
    },
  ],
}

const params = { establishmentId: 'e1', serviceId: 's1' }

// Le routeur precharge a l'intention (`defaultPreload: 'intent'`, voir
// `main.tsx`) : survoler un lien execute deja `beforeLoad`, avant toute
// navigation reelle. Ce test verrouille que les effets de bord (store,
// `localStorage`) ne s'executent jamais pendant un prechargement, seulement
// lors d'une vraie navigation — sans quoi un simple survol ferait fuiter le
// contexte d'un autre service vers l'ecran affiche.
describe('beforeLoad du layout de service — effets de bord reserves a la navigation', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true, user, context: null })
    localStorage.clear()
  })

  const runBeforeLoad = (preload: boolean) => {
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) {
      throw new Error('beforeLoad manquant sur la route')
    }
    // Seuls les champs effectivement lus par l'implementation (context,
    // params, preload) sont fournis : le reste du contrat de
    // `BeforeLoadContextOptions` (abortController, location, cause...) ne
    // concerne pas ce layout et n'a pas a etre simule.
    return beforeLoad({
      context: { authState: { isAuthenticated: true, user } },
      params,
      preload,
    } as Parameters<typeof beforeLoad>[0])
  }

  it('ne pose pas le store ni le dernier contexte memorise pendant un prechargement', () => {
    runBeforeLoad(true)

    expect(useAuthStore.getState().context).toBeNull()
    expect(localStorage.getItem(LAST_CONTEXT_KEY(user.id))).toBeNull()
  })

  it('pose le store et memorise le contexte lors d une vraie navigation', () => {
    runBeforeLoad(false)

    expect(useAuthStore.getState().context).toEqual({
      establishmentId: 'e1',
      serviceId: 's1',
      establishmentRole: 'ADMIN',
      serviceRole: 'COORDINATEUR',
      soignantId: 'so1',
    })
    expect(localStorage.getItem(LAST_CONTEXT_KEY(user.id))).toBe(
      JSON.stringify({ establishmentId: 'e1', serviceId: 's1' }),
    )
  })
})

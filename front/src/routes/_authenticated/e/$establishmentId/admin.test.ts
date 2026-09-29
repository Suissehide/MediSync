import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { LAST_CONTEXT_KEY } from '@/utils/tenant-context.ts'

import { Route } from './admin.tsx'

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      // Un administrateur sans affectation de service : exactement le cas
      // que ce layout existe pour laisser malgre tout atteindre
      // l'administration.
      services: [],
    },
  ],
}

const member: User = {
  id: 'u2',
  email: 'membre@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
}

const params = { establishmentId: 'e1' }

const runBeforeLoad = (user: User, preload: boolean) => {
  const beforeLoad = Route.options.beforeLoad
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant sur la route')
  }
  // Seuls les champs effectivement lus par l'implementation (context,
  // params, preload) sont fournis, comme dans le test jumeau du layout de
  // service (`s/$serviceId.test.ts`).
  return beforeLoad({
    context: { authState: { isAuthenticated: true, user } },
    params,
    preload,
  } as Parameters<typeof beforeLoad>[0])
}

describe('beforeLoad du layout d etablissement', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true, user: admin, context: null })
    localStorage.clear()
  })

  it('refuse un membre sans role ADMIN sur cet etablissement', () => {
    // C'est ici que se referme le trou de permission laisse par la tache 7 :
    // sans ce garde, quiconque est authentifie atteindrait /e/:id/admin/*.
    // `resolveEstablishmentContext` exige le role ADMIN ; un simple membre
    // est redirige avant que le contexte ne soit jamais pose.
    expect(() => runBeforeLoad(member, false)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/choose-context' }),
    )
    expect(useAuthStore.getState().context).toBeNull()
  })

  it('ne pose pas le contexte pendant un prechargement', () => {
    runBeforeLoad(admin, true)

    expect(useAuthStore.getState().context).toBeNull()
  })

  it('pose un contexte sans service lors d une vraie navigation, sans le memoriser', () => {
    runBeforeLoad(admin, false)

    expect(useAuthStore.getState().context).toEqual({
      establishmentId: 'e1',
      serviceId: null,
      establishmentRole: 'ADMIN',
      serviceRole: null,
      soignantId: null,
    })
    // Un contexte sans service ne designe aucun service : il ne doit jamais
    // servir de « dernier visite » (voir `rememberContext`, jamais appele
    // ici).
    expect(localStorage.getItem(LAST_CONTEXT_KEY(admin.id))).toBeNull()
  })
})

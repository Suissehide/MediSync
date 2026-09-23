import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchWithAuth, registerStaleTenantHandler } from './fetchWithAuth.ts'

// Un 404 sur une route de tenant (`/e/...`), alors que le front croyait le
// couple etablissement/service valide, signifie que son arbre des
// appartenances est perime : le back fait foi. Le rappel enregistre depuis
// `main.tsx` doit alors se declencher — et seulement dans ce cas : un 404
// sur `/me` (hors tenant) ou sur une ressource absente d'ailleurs ne doit
// rien provoquer, sous peine de renvoyer l'utilisateur au choix de contexte
// pour une simple ressource introuvable.
describe('fetchWithAuth — 404 de tenant perime', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('declenche le rappel pour un 404 sur une route de tenant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        url: 'http://localhost:3000/e/e1/s/s1/patient/px',
      }),
    )
    const onStaleTenant = vi.fn()
    registerStaleTenantHandler(onStaleTenant)

    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/px')

    expect(onStaleTenant).toHaveBeenCalledTimes(1)
  })

  it('ne declenche rien pour un 404 sur /me, hors tenant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        url: 'http://localhost:3000/me',
      }),
    )
    const onStaleTenant = vi.fn()
    registerStaleTenantHandler(onStaleTenant)

    await fetchWithAuth('http://localhost:3000/me')

    expect(onStaleTenant).not.toHaveBeenCalled()
  })

  it('ne declenche rien pour un 404 sur une ressource absente hors tenant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        url: 'http://localhost:3000/auth/inexistant',
      }),
    )
    const onStaleTenant = vi.fn()
    registerStaleTenantHandler(onStaleTenant)

    await fetchWithAuth('http://localhost:3000/auth/inexistant')

    expect(onStaleTenant).not.toHaveBeenCalled()
  })

  it('ne declenche rien quand la reponse est un succes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        url: 'http://localhost:3000/e/e1/s/s1/patient/px',
      }),
    )
    const onStaleTenant = vi.fn()
    registerStaleTenantHandler(onStaleTenant)

    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/px')

    expect(onStaleTenant).not.toHaveBeenCalled()
  })
})

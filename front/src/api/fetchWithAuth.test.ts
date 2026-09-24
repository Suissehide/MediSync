import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchWithAuth, registerStaleTenantHandler } from './fetchWithAuth.ts'

// Un 404 sur une route de tenant (`/e/...`) PEUT signifier que l'arbre des
// appartenances du front est perime, mais peut tout aussi bien etre une
// simple ressource absente du service courant, couple toujours valide : la
// distinction n'appartient pas a `fetchWithAuth` (voir `main.tsx` et
// `isTenantRouteStale`, qui la font). Ce module se contente de borner QUAND
// interroger le rappel : sur un 404 de route de tenant, avec le chemin en
// echec — et seulement dans ce cas. Un 404 sur `/me` (hors tenant) ou sur
// une ressource absente d'ailleurs ne doit rien provoquer.
describe('fetchWithAuth — 404 de route de tenant', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('declenche le rappel avec le chemin en echec, pour un 404 sur une route de tenant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        url: 'http://localhost:3000/e/e1/s/s1/patient/px',
      }),
    )
    const onStaleTenant = vi.fn().mockResolvedValue(undefined)
    registerStaleTenantHandler(onStaleTenant)

    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/px')

    expect(onStaleTenant).toHaveBeenCalledTimes(1)
    expect(onStaleTenant).toHaveBeenCalledWith('/e/e1/s/s1/patient/px')
  })

  it('ne declenche rien pour un 404 sur /me, hors tenant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        url: 'http://localhost:3000/me',
      }),
    )
    const onStaleTenant = vi.fn().mockResolvedValue(undefined)
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
    const onStaleTenant = vi.fn().mockResolvedValue(undefined)
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
    const onStaleTenant = vi.fn().mockResolvedValue(undefined)
    registerStaleTenantHandler(onStaleTenant)

    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/px')

    expect(onStaleTenant).not.toHaveBeenCalled()
  })

  // Un ecran qui charge plusieurs ressources d'un coup peut voir plusieurs
  // requetes echouer par 404 en meme temps, toutes pour le meme couple retire
  // : sans garde-fou, chacune relancerait son propre rechargement de `/me`.
  // Meme forme que le garde-fou du rafraichissement de session (401) plus
  // haut dans ce fichier.
  it('ne relance pas le rappel tant qu une verification est en cours, mais en relance une nouvelle une fois la precedente terminee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        url: 'http://localhost:3000/e/e1/s/s1/patient/px',
      }),
    )
    let resolveCheck: (() => void) | undefined
    const onStaleTenant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve
        }),
    )
    registerStaleTenantHandler(onStaleTenant)

    // Premier 404 : declenche une verification qui ne s'est pas encore
    // resolue.
    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/px')
    expect(onStaleTenant).toHaveBeenCalledTimes(1)

    // Deuxieme 404, concurrent au premier : la verification precedente est
    // toujours en vol, celle-ci ne doit pas en relancer une seconde.
    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/py')
    expect(onStaleTenant).toHaveBeenCalledTimes(1)

    // La verification precedente se termine.
    resolveCheck?.()
    await Promise.resolve()
    await Promise.resolve()

    // Un troisieme 404, apres coup : la voie est libre, une nouvelle
    // verification doit repartir.
    await fetchWithAuth('http://localhost:3000/e/e1/s/s1/patient/pz')
    expect(onStaleTenant).toHaveBeenCalledTimes(2)
  })
})

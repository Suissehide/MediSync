import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthApi } from './auth.api.ts'

// Le jeton d'un lien d'accès est un mot de passe à usage unique (tâche 13,
// brief) : il arrive dans l'URL du navigateur, mais ne doit JAMAIS repartir
// dans l'URL d'un appel d'API — il part dans le CORPS de la requête. Même
// exigence que côté back (`access-link.router.ts`, commentaire de tête).
const JETON = 'jeton-tres-secret-a-ne-jamais-mettre-dans-une-url'

describe('AuthApi.consumeAccessLink', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie le jeton dans le corps de la requete, jamais dans son URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await AuthApi.consumeAccessLink({
      token: JETON,
      password: 'un-mot-de-passe-suffisant',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain(JETON)
    expect(String(init?.body)).toContain(JETON)
  })

  it('distingue un 410 (lien invalide/expire) d un 401 (compte desactive)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => ({ message: 'Invalid or expired access link' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      AuthApi.consumeAccessLink({
        token: JETON,
        password: 'un-mot-de-passe-suffisant',
      }),
    ).rejects.toMatchObject({ status: 410 })
  })
})

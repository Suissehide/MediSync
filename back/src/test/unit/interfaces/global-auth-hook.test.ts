import { routes } from '../../../main/interfaces/http/fastify/routes'

// Le hook onRequest global du plugin de routes racine porte deux gardes :
// la fermeture de la portee du tenant et l'authentification par defaut. La
// premiere doit s'executer AVANT le test des routes publiques, sinon une
// requete publique (ou /auth/*) laisserait intact le tenant pose par la
// requete precedente sur le meme worker.
const buildFastify = () => {
  const order: string[] = []
  const hooks: Record<string, (...args: unknown[]) => Promise<void>> = {}
  const fastify = {
    iocContainer: {
      tenantContext: {
        clear: () => {
          order.push('clear')
        },
      },
    },
    verifySessionCookie: () => {
      order.push('verifySessionCookie')
      return Promise.resolve()
    },
    addHook: (
      event: string,
      handler: (...args: unknown[]) => Promise<void>,
    ) => {
      hooks[event] = handler
    },
    get: () => undefined,
    register: () => Promise.resolve(),
  }
  return { fastify, hooks, order }
}

const load = async () => {
  const { fastify, hooks, order } = buildFastify()
  await (routes as unknown as (f: unknown, o: unknown) => Promise<void>)(
    fastify,
    {},
  )
  const onRequest = hooks.onRequest
  if (!onRequest) {
    throw new Error('aucun hook onRequest pose')
  }
  return { onRequest, order }
}

const request = (url: string) => ({ routeOptions: { url }, url })

describe('hook onRequest global des routes', () => {
  it('referme la portee du tenant avant tout, y compris sur une route publique', async () => {
    const { onRequest, order } = await load()
    await onRequest(request('/health'), {})
    expect(order).toEqual(['clear'])
  })

  it('referme la portee du tenant avant tout sur le prefixe /auth/', async () => {
    const { onRequest, order } = await load()
    await onRequest(request('/auth/sign-in'), {})
    expect(order).toEqual(['clear'])
  })

  it('referme la portee du tenant avant de verifier la session', async () => {
    const { onRequest, order } = await load()
    await onRequest(request('/e/:establishmentId/s/:serviceId/todo'), {})
    expect(order).toEqual(['clear', 'verifySessionCookie'])
  })
})

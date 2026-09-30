import { establishmentAdminRoutes } from '../../../main/interfaces/http/fastify/routes/establishment-admin.routes'
import { tenantRoutes } from '../../../main/interfaces/http/fastify/routes/tenant.routes'

// Les deux plugins de routes portent les memes gardes transverses. Les
// verifier ici, plutot que route par route, est le seul moyen de faire
// echouer quelque chose quand l'un d'eux disparait : le filtre clinique des
// routes d'administration, par exemple, n'a aujourd'hui aucune route qui
// renvoie du contenu clinique — c'est une ceinture pour les routes a venir
// (`Patient` est un modele d'etablissement), et sans ce test la retirer ne
// couterait rien.
const REQUIRED_HOOKS = [
  ['onRoute', 'assertRoutePermission'],
  ['preHandler', 'enforcePermission'],
  ['preValidation', 'stripClinicalInput'],
  ['preSerialization', 'stripClinicalFields'],
] as const

const collectHooks = async (
  plugin: (fastify: unknown, options: unknown) => Promise<void> | void,
  onRequestName: string,
) => {
  const hooks: { event: string; handler: unknown }[] = []
  const decorators: Record<string, unknown> = {
    resolveTenant: Symbol('resolveTenant'),
    resolveEstablishmentAdmin: Symbol('resolveEstablishmentAdmin'),
    enforcePermission: Symbol('enforcePermission'),
    stripClinicalInput: Symbol('stripClinicalInput'),
    stripClinicalFields: Symbol('stripClinicalFields'),
  }
  const fastify = {
    ...decorators,
    addHook: (event: string, handler: unknown) =>
      hooks.push({ event, handler }),
    register: () => Promise.resolve(),
    patch: () => undefined,
  }
  await plugin(fastify, {})
  return { hooks, decorators, onRequestName }
}

describe('gardes transverses des plugins de routes', () => {
  it.each([
    ['tenantRoutes', tenantRoutes, 'resolveTenant'],
    [
      'establishmentAdminRoutes',
      establishmentAdminRoutes,
      'resolveEstablishmentAdmin',
    ],
  ])(
    '%s pose les quatre gardes et resout le tenant',
    async (_name, plugin, onRequestName) => {
      const { hooks, decorators } = await collectHooks(
        plugin as unknown as (
          fastify: unknown,
          options: unknown,
        ) => Promise<void>,
        onRequestName,
      )

      expect(hooks.find((h) => h.event === 'onRequest')?.handler).toBe(
        decorators[onRequestName],
      )
      for (const [event, decorator] of REQUIRED_HOOKS) {
        const found = hooks.find((h) => h.event === event)
        // `assertRoutePermission` est une fonction importee, pas un decorateur :
        // on verifie seulement qu'un hook est bien pose sur cet evenement.
        expect({ event, posed: found !== undefined }).toEqual({
          event,
          posed: true,
        })
        if (decorator in decorators) {
          expect({ event, handler: found?.handler }).toEqual({
            event,
            handler: decorators[decorator],
          })
        }
      }
    },
  )
})

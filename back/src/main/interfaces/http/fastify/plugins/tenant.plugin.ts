import Boom from '@hapi/boom'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
  onRequestHookHandler,
  preHandlerAsyncHookHandler,
  preSerializationAsyncHookHandler,
  preValidationAsyncHookHandler,
} from 'fastify'
import type { FastifyPluginAsync } from 'fastify/types/plugin'
import fastifyPlugin from 'fastify-plugin'

import {
  effectiveMemberships,
  liveGrantsForUser,
} from '../../../../domain/accessGrant.domain'
import type { LiveGrant } from '../../../../types/domain/accessGrant.domain.interface'
import type { UserWithMemberships } from '../../../../types/infra/orm/repositories/user.repository.interface'
import type { Tenant } from '../../../../types/utils/tenant-context'
import { withoutClinicalFields } from '../../../../utils/clinical-fields'
import { hasPermission, type Permission } from '../../../../utils/permissions'

declare module 'fastify' {
  export interface FastifyRequest {
    // Optionnel, et c'est important : le tenant n'existe qu'une fois
    // `resolveTenant` passé. Sur le chemin d'échec — établissement ou service
    // qui ne correspond à aucune appartenance — il n'est jamais posé, et les
    // hooks suivants s'exécutent quand même sur la réponse d'erreur. Le
    // déclarer non optionnel faisait passer les déstructurations pour sûres.
    tenant?: Tenant
  }
  export interface FastifyContextConfig {
    permission?: Permission
  }
  export interface FastifyInstance {
    // Style callback (done), pas promesse : voir le commentaire au-dessus de leur définition
    // plus bas — un `enterWith` appelé après un `await` réel, sous forme promesse, perd le
    // contexte asynchrone entre deux requêtes concurrentes (démontré par exécution).
    resolveTenant: onRequestHookHandler
    resolveEstablishmentAdmin: onRequestHookHandler
    enforcePermission: preHandlerAsyncHookHandler
    stripClinicalFields: preSerializationAsyncHookHandler
    stripClinicalInput: preValidationAsyncHookHandler
  }
}

type TenantParams = { establishmentId: string; serviceId?: string }

// De l'arbre des appartenances EFFECTIVES (réelles + octrois vivants — voir
// `effectiveMemberships`, domain/accessGrant.domain.ts, LA seule fonction qui décide de cet
// arbre, aussi employée par `/me` : voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts) et des paramètres d'URL vers
// le tenant. 404 dans tous les cas d'échec, y compris un octroi qui vient d'expirer, pour ne pas
// révéler l'existence d'un établissement ou d'un service auquel on n'a plus accès.
//
// `grants` N'A PAS de valeur par défaut, à dessein (tour de correction 1, tâche 3) : un défaut
// à `[]` compilerait sans broncher pour un appelant qui aurait oublié de lire les octrois — la
// divergence exacte que cette tâche existe pour empêcher, silencieuse puisque ce fichier est
// typé et vérifié par `tsc` (voir back/CLAUDE.md). Chaque appelant, y compris un test, doit donc
// dire explicitement « aucun octroi » (`[]`) plutôt que de le recevoir par omission. `now` garde
// un défaut (`new Date()`) : aucun appelant ne peut se tromper en omettant l'heure réelle, ce
// n'est pas la même classe de risque.
export const resolveTenantFromUser = (
  user: UserWithMemberships,
  params: TenantParams,
  options: { requireEstablishmentAdmin: boolean },
  grants: LiveGrant[],
  now: Date = new Date(),
): Tenant => {
  const effectives = effectiveMemberships(user, grants, now)
  const membership = effectives.find(
    (m) => m.establishmentId === params.establishmentId,
  )
  if (!membership) {
    throw Boom.notFound()
  }
  // Le soignant lié n'existe que pour une appartenance RÉELLE (un octroi n'en pose jamais) : lu
  // séparément sur `user.establishmentMemberships`, une simple consultation de donnée déjà
  // chargée — pas une seconde décision sur ce qui est accessible, qui reste entièrement celle
  // d'`effectiveMemberships` ci-dessus.
  const soignantId =
    membership.origine === 'reelle'
      ? (user.establishmentMemberships.find(
          (m) => m.establishmentId === params.establishmentId,
        )?.soignantId ?? null)
      : null
  if (options.requireEstablishmentAdmin) {
    if (membership.role !== 'ADMIN') {
      throw Boom.notFound()
    }
    return {
      userId: user.id,
      establishmentId: membership.establishmentId,
      establishmentRole: membership.role,
      serviceId: null,
      serviceRole: null,
      soignantId,
    }
  }
  const service = membership.services.find((s) => s.id === params.serviceId)
  if (!service) {
    throw Boom.notFound()
  }
  return {
    userId: user.id,
    establishmentId: membership.establishmentId,
    establishmentRole: membership.role,
    serviceId: service.id,
    serviceRole: service.role,
    soignantId,
  }
}

const paramsOf = (request: FastifyRequest): TenantParams =>
  request.params as TenantParams

// Fail-safe : une route tenant ou admin sans `config.permission` fait échouer
// le démarrage. Utilisé par les hooks onRoute des plugins de routes.
export const assertRoutePermission = (route: {
  method: unknown
  url: string
  config?: { permission?: Permission }
}): void => {
  if (!route.config?.permission) {
    throw new Error(
      `Route without permission: ${String(route.method)} ${route.url}`,
    )
  }
}

// Second fail-safe, posé à la racine des routes plutôt que dans les deux
// plugins de tenant. `assertRoutePermission` ne voit que les routes déclarées
// *sous* ces plugins, donc sous leurs hooks de résolution, de permission et de
// filtrage clinique. Une route dont l'URL porte un identifiant
// d'établissement mais qui serait enregistrée ailleurs échapperait à tous ces
// hooks sans que rien ne le signale : elle lirait la base sans tenant, et le
// garde-fou Prisma serait la seule barrière restante. Ici, la forme de l'URL
// suffit à exiger la déclaration, où que la route soit posée.
export const assertTenantShapedRoute = (route: {
  method: unknown
  url: string
  config?: { permission?: Permission }
}): void => {
  if (route.url.includes(':establishmentId')) {
    assertRoutePermission(route)
  }
}

// À utiliser dans un handler qui a besoin du tenant. `enforcePermission` l'a
// déjà exigé en `preHandler`, donc il est présent — mais le type ne le sait
// pas, et le faire croire par une assertion rendrait muette la prochaine route
// qui oublierait le hook. Ici l'absence coûte un 404, comme partout ailleurs.
export const requireTenant = (request: FastifyRequest): Tenant => {
  if (!request.tenant) {
    throw Boom.notFound()
  }
  return request.tenant
}

const tenantPlugin: FastifyPluginAsync = fastifyPlugin(
  (fastify: FastifyInstance) => {
    const { tenantContext, accessGrantRepository } = fastify.iocContainer

    // Depuis la tâche 3 (étape 4a), résoudre le tenant lit aussi les octrois vivants de
    // l'utilisateur (`liveGrantsForUser` — depuis le tour de correction 1 de la tâche 8, un
    // relais qui appelle TOUJOURS `AccessGrantRepository.findForUser` ; c'est cette dernière qui
    // décide, en interne, si la lecture va plus loin qu'une seule colonne — voir
    // accessGrant.domain.ts) AVANT d'appeler `tenantContext.enter` — alors qu'avant, `enter` était
    // le tout premier geste, synchrone, du hook. Ce délai réel change la forme qu'exige
    // `tenantContext.enter` (qui repose sur `AsyncLocalStorage.enterWith`).
    //
    // CE N'EST PAS UN DÉFAUT DE CONCURRENCE — corrigé dans la description après une revue qui l'a
    // démontré par exécution (tour de correction 1, tâche 3) : posé en mode PROMESSE (fonction
    // `async` à un seul argument, comme le reste de ce fichier), le contexte posé par
    // `enterWith` ne survivait pas jusqu'au handler pour une requête SEULE et SÉQUENTIELLE — pas
    // seulement sous deux requêtes concurrentes. La suite e2e entière le démontrait (79 des 113
    // tests rougissaient, un échec déterministe, pas une course rare frôlée de peu). Sa seule
    // bonne nouvelle : c'était une perte TOTALE du contexte pour la requête qui le posait, jamais
    // une contamination croisée vers une autre — huit tenants résolus ensemble donnaient huit
    // résultats corrects une fois le remède posé, et les deux façons naïves d'écrire encore le
    // crochet échouaient elles aussi fermé (404/500), jamais en silence.
    //
    // Remède, vérifié par exécution (`tenant-plugin-concurrency.test.ts` et par la suite e2e
    // entière) : repasser en mode CALLBACK (troisième paramètre `done`, type
    // `onRequestHookHandler` plutôt qu'`onRequestAsyncHookHandler`) et n'appeler `done()`
    // qu'APRÈS `enter()`, à l'intérieur du `.then()` de la promesse asynchrone — Fastify enchaîne
    // alors la phase suivante à même cette continuation, et le contexte survit.
    const resolve = (options: {
      requireEstablishmentAdmin: boolean
    }): onRequestHookHandler =>
      function (
        this: FastifyInstance,
        request: FastifyRequest,
        _reply: FastifyReply,
        done: HookHandlerDoneFunction,
      ) {
        liveGrantsForUser(request.currentUser.id, accessGrantRepository)
          .then((grants) => {
            // Horloge prise ICI, à l'instant de la résolution — jamais mise en cache d'une
            // requête à l'autre : c'est ce qui fait qu'un octroi qui vient d'expirer est refusé
            // dès la requête suivante, sans attendre une reconnexion (Review Focus n°2).
            const tenant = resolveTenantFromUser(
              request.currentUser,
              paramsOf(request),
              options,
              grants,
              new Date(),
            )
            request.tenant = tenant
            tenantContext.enter(tenant)
            done()
          })
          .catch(done)
      }

    fastify.decorate(
      'resolveTenant',
      resolve({ requireEstablishmentAdmin: false }),
    )
    fastify.decorate(
      'resolveEstablishmentAdmin',
      resolve({ requireEstablishmentAdmin: true }),
    )

    // Lit la permission déclarée dans `config` de la route ; le fail-safe
    // onRoute des plugins de routes garantit qu'elle existe.
    fastify.decorate(
      'enforcePermission',
      function (this: FastifyInstance, request: FastifyRequest) {
        const permission = request.routeOptions.config.permission
        if (!permission) {
          throw Boom.internal('Route without permission')
        }
        // Sans tenant, on ne peut rien autoriser : même 404 que
        // `resolveTenantFromUser`, pour ne pas distinguer « service inconnu »
        // de « service auquel vous n'appartenez pas ».
        if (!request.tenant) {
          throw Boom.notFound()
        }
        const { serviceRole, establishmentRole } = request.tenant
        if (!hasPermission({ serviceRole, establishmentRole }, permission)) {
          throw Boom.forbidden('Insufficient permission')
        }
        return Promise.resolve()
      },
    )
    // Filtre de sortie des champs cliniques. Posé en hook plutôt que recopié
    // dans chaque handler : une route nouvelle qui renverrait un patient — ou
    // qui en embarquerait un via un rendez-vous, un créneau ou un parcours —
    // est filtrée sans que son auteur ait à y penser. C'est le même parti pris
    // de refus par défaut que le garde `onRoute` des permissions.
    fastify.decorate(
      'stripClinicalFields',
      function (
        this: FastifyInstance,
        request: FastifyRequest,
        _reply: unknown,
        payload: unknown,
      ) {
        // Ce hook s'exécute aussi sur la charge d'une réponse d'erreur, donc
        // sur le chemin où le tenant n'a jamais été résolu. Sans tenant, on
        // filtre : refus par défaut, et surtout pas une exception, qui
        // remplacerait le corps du 404 par un message interne.
        if (!request.tenant) {
          return Promise.resolve(withoutClinicalFields(payload))
        }
        const { serviceRole, establishmentRole } = request.tenant
        if (
          hasPermission({ serviceRole, establishmentRole }, 'clinical:read')
        ) {
          return Promise.resolve(payload)
        }
        return Promise.resolve(withoutClinicalFields(payload))
      },
    )
    // Pendant du filtre de sortie, sur l'entrée. Sans lui, un rôle qui ne peut
    // pas *lire* le contenu clinique peut quand même l'*écraser* : le
    // secrétariat a `patient:write` et enverrait `notes` à vide sans jamais
    // pouvoir relire ce qu'il détruit. Posé en `preValidation` : le champ est
    // retiré avant même la validation, donc ni le schéma ni le handler ne le
    // voient. Retirer la clé — plutôt que la mettre à vide — laisse la colonne
    // inchangée en base.
    fastify.decorate(
      'stripClinicalInput',
      function (this: FastifyInstance, request: FastifyRequest) {
        // Même parti pris que le filtre de sortie : sans tenant, on retire.
        if (!request.tenant) {
          request.body = withoutClinicalFields(request.body)
          return Promise.resolve()
        }
        const { serviceRole, establishmentRole } = request.tenant
        if (
          !hasPermission({ serviceRole, establishmentRole }, 'clinical:write')
        ) {
          request.body = withoutClinicalFields(request.body)
        }
        return Promise.resolve()
      },
    )
    return Promise.resolve()
  },
)

export { tenantPlugin }

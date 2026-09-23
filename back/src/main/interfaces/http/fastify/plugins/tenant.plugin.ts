import Boom from '@hapi/boom'
import type {
  FastifyInstance,
  FastifyRequest,
  onRequestAsyncHookHandler,
  preHandlerAsyncHookHandler,
  preSerializationAsyncHookHandler,
  preValidationAsyncHookHandler,
} from 'fastify'
import type { FastifyPluginAsync } from 'fastify/types/plugin'
import fastifyPlugin from 'fastify-plugin'

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
    resolveTenant: onRequestAsyncHookHandler
    resolveEstablishmentAdmin: onRequestAsyncHookHandler
    enforcePermission: preHandlerAsyncHookHandler
    stripClinicalFields: preSerializationAsyncHookHandler
    stripClinicalInput: preValidationAsyncHookHandler
  }
}

type TenantParams = { establishmentId: string; serviceId?: string }

// Pure : de l'arbre des appartenances et des paramètres d'URL vers le tenant.
// 404 dans tous les cas d'échec pour ne pas révéler l'existence d'un service.
export const resolveTenantFromUser = (
  user: UserWithMemberships,
  params: TenantParams,
  options: { requireEstablishmentAdmin: boolean },
): Tenant => {
  const membership = user.establishmentMemberships.find(
    (m) =>
      m.establishmentId === params.establishmentId &&
      m.establishment.deactivatedAt === null,
  )
  if (!membership) {
    throw Boom.notFound()
  }
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
      soignantId: membership.soignantId,
    }
  }
  const serviceMembership = membership.serviceMemberships.find(
    (sm) =>
      sm.serviceId === params.serviceId && sm.service.deactivatedAt === null,
  )
  if (!serviceMembership) {
    throw Boom.notFound()
  }
  return {
    userId: user.id,
    establishmentId: membership.establishmentId,
    establishmentRole: membership.role,
    serviceId: serviceMembership.serviceId,
    serviceRole: serviceMembership.role,
    soignantId: membership.soignantId,
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
    const { tenantContext } = fastify.iocContainer

    fastify.decorate(
      'resolveTenant',
      function (this: FastifyInstance, request: FastifyRequest) {
        const tenant = resolveTenantFromUser(
          request.currentUser,
          paramsOf(request),
          { requireEstablishmentAdmin: false },
        )
        request.tenant = tenant
        tenantContext.enter(tenant)
        return Promise.resolve()
      },
    )

    fastify.decorate(
      'resolveEstablishmentAdmin',
      function (this: FastifyInstance, request: FastifyRequest) {
        const tenant = resolveTenantFromUser(
          request.currentUser,
          paramsOf(request),
          { requireEstablishmentAdmin: true },
        )
        request.tenant = tenant
        tenantContext.enter(tenant)
        return Promise.resolve()
      },
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

import Boom from '@hapi/boom'
import type {
  FastifyInstance,
  FastifyRequest,
  onRequestAsyncHookHandler,
  preHandlerAsyncHookHandler,
  preSerializationAsyncHookHandler,
  preValidationAsyncHookHandler,
} from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify/types/plugin'

import type { UserWithMemberships } from '../../../../types/infra/orm/repositories/user.repository.interface'
import type { Tenant } from '../../../../types/utils/tenant-context'
import { withoutClinicalFields } from '../../../../utils/clinical-fields'
import { hasPermission, type Permission } from '../../../../utils/permissions'

declare module 'fastify' {
  export interface FastifyRequest {
    tenant: Tenant
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

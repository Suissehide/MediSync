import type { FastifyPluginAsync } from 'fastify'

import {
  type CreateServiceBody,
  createServiceSchema,
  type ServiceParams,
  serviceDeactivationImpactResponseSchema,
  serviceParamsSchema,
  serviceResponseSchema,
  servicesResponseSchema,
  type UpdateServiceBody,
  updateServiceSchema,
} from '../schemas/service.schema'

// Gestion des services, sous le préfixe d'établissement :
// /e/:establishmentId/admin/services (spec §6.2).
const servicesRouter: FastifyPluginAsync = (fastify) => {
  const { serviceDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: servicesResponseSchema } },
      config: { permission: 'services:manage' },
    },
    () => serviceDomain.findAll(),
  )

  // Décision 3.2 (spec §3.2) : créer un service y rattache son créateur, comme COORDINATEUR —
  // voir ServiceDomain.create pour le motif.
  fastify.post<{ Body: CreateServiceBody }>(
    '/',
    {
      schema: {
        body: createServiceSchema,
        response: { 201: serviceResponseSchema },
      },
      config: { permission: 'services:manage' },
    },
    async (request, reply) => {
      const service = await serviceDomain.create(request.body)
      reply.code(201)
      return service
    },
  )

  // Renomme, désactive, réactive — une seule route pour les trois (spec §6.2). Désactiver
  // n'exige aucun transfert (décision 3.6) : c'est réversible, réactiver rend tout.
  fastify.patch<{ Params: ServiceParams; Body: UpdateServiceBody }>(
    '/:id',
    {
      schema: {
        params: serviceParamsSchema,
        body: updateServiceSchema,
        response: { 200: serviceResponseSchema },
      },
      config: { permission: 'services:manage' },
    },
    (request) => serviceDomain.update(request.params.id, request.body),
  )

  // Décision 3.6 (spec §3.6) : les compteurs affichés avant de désactiver — absente du tableau
  // initial de la spécification, qui avait tort : l'écran ne peut
  // pas avertir sans compter.
  fastify.get<{ Params: ServiceParams }>(
    '/:id/impact-desactivation',
    {
      schema: {
        params: serviceParamsSchema,
        response: { 200: serviceDeactivationImpactResponseSchema },
      },
      config: { permission: 'services:manage' },
    },
    (request) => serviceDomain.impactDesactivation(request.params.id),
  )

  return Promise.resolve()
}

export { servicesRouter }

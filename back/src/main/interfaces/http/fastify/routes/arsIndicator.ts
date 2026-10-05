import type { FastifyPluginAsync } from 'fastify'

import {
  type ArsIndicatorQuery,
  arsIndicatorQuerySchema,
  arsIndicatorsResponseSchema,
} from '../schemas/arsIndicator.schema'

// Indicateurs de l'enquête annuelle ARS du service courant : chiffres agrégés, aucune donnée
// nominative (MDS-26).
const arsIndicatorRouter: FastifyPluginAsync = (fastify) => {
  const { arsIndicatorDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ArsIndicatorQuery }>(
    '/',
    {
      schema: {
        querystring: arsIndicatorQuerySchema,
        response: { 200: arsIndicatorsResponseSchema },
      },
      config: { permission: 'stats:read' },
    },
    async (request) => {
      const { from, to } = request.query
      return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        indicators: await arsIndicatorDomain.findAll({ from, to }),
      }
    },
  )

  return Promise.resolve()
}

export { arsIndicatorRouter }

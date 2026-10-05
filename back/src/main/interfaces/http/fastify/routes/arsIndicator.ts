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

  // Le classeur est un Buffer : pas de `response` Zod, la sérialisation JSON ne s'y applique pas.
  fastify.get<{ Querystring: ArsIndicatorQuery }>(
    '/export',
    {
      schema: { querystring: arsIndicatorQuerySchema },
      config: { permission: 'stats:read' },
    },
    async (request, reply) => {
      const { from, to } = request.query
      const buffer = await arsIndicatorDomain.exportExcel({ from, to })
      const nom = `indicateurs-ars_${from.toISOString().slice(0, 10)}_${to
        .toISOString()
        .slice(0, 10)}.xlsx`
      await reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('Content-Disposition', `attachment; filename="${nom}"`)
        .send(buffer)
    },
  )

  return Promise.resolve()
}

export { arsIndicatorRouter }

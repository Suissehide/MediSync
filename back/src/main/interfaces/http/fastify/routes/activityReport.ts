import type { FastifyPluginAsync } from 'fastify'

import { activityReportResponseSchema } from '../schemas/activityReport.schema'
import {
  type ArsIndicatorQuery,
  arsIndicatorQuerySchema,
} from '../schemas/arsIndicator.schema'

// Tableau de bord d'activité du service courant : chiffres agrégés, aucune donnée nominative (MDS-40).
const activityReportRouter: FastifyPluginAsync = (fastify) => {
  const { activityReportDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ArsIndicatorQuery }>(
    '/',
    {
      schema: {
        querystring: arsIndicatorQuerySchema,
        response: { 200: activityReportResponseSchema },
      },
      config: { permission: 'activity:read' },
    },
    async (request) => {
      const { from, to } = request.query
      return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        ...(await activityReportDomain.report({ from, to })),
      }
    },
  )

  return Promise.resolve()
}

export { activityReportRouter }

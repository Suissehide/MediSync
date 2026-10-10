import type { FastifyPluginAsync } from 'fastify'

import {
  type ActivityReportQuery,
  activityReportQuerySchema,
  activityReportResponseSchema,
} from '../schemas/activityReport.schema'

// Tableau de bord d'activité du service courant : chiffres agrégés, aucune donnée nominative (MDS-40).
const activityReportRouter: FastifyPluginAsync = (fastify) => {
  const { activityReportDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ActivityReportQuery }>(
    '/',
    {
      schema: {
        querystring: activityReportQuerySchema,
        response: { 200: activityReportResponseSchema },
      },
      config: { permission: 'activity:read' },
    },
    async (request) => {
      const { from, to, pathwayTemplateId } = request.query
      return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        ...(await activityReportDomain.report({ from, to }, pathwayTemplateId)),
      }
    },
  )

  return Promise.resolve()
}

export { activityReportRouter }

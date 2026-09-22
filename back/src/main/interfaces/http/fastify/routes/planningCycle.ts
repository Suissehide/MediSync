import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  planningCycleNullableResponseSchema,
  planningCycleResponseSchema,
  type SavePlanningCycleBody,
  savePlanningCycleBodySchema,
} from '../schemas/planningCycle.schema'

const planningCycleRouter: FastifyPluginAsync = (fastify) => {
  const { planningCycleDomain } = fastify.iocContainer

  // Lisible par tout membre du service : la numerotation des semaines
  // s'affiche pour tout le monde, seule sa configuration est reservee.
  fastify.get(
    '/',
    {
      schema: { response: { 200: planningCycleNullableResponseSchema } },
      config: { permission: 'planning:read' },
    },
    () => planningCycleDomain.find(),
  )

  // Enregistrer / mettre a jour
  fastify.put<{ Body: SavePlanningCycleBody }>(
    '/',
    {
      schema: {
        body: savePlanningCycleBodySchema,
        response: {
          200: planningCycleResponseSchema,
          403: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'planning:write' },
    },
    (request) => {
      return planningCycleDomain.save({
        startOfWeek: request.body.startOfWeek,
        weekCount: request.body.weekCount,
      })
    },
  )

  // Reinitialiser : le planning repasse en numerotation ISO
  fastify.delete(
    '/',
    {
      schema: {
        response: {
          204: z.null(),
          403: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'planning:write' },
    },
    async (_request, reply) => {
      await planningCycleDomain.delete()
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { planningCycleRouter }

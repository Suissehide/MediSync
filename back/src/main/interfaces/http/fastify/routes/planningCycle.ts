import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { Role } from '../../../../../generated/enums'
import {
  planningCycleNullableResponseSchema,
  planningCycleResponseSchema,
  type SavePlanningCycleBody,
  savePlanningCycleBodySchema,
} from '../schemas/planningCycle.schema'

const planningCycleRouter: FastifyPluginAsync = (fastify) => {
  const { planningCycleDomain, userDomain } = fastify.iocContainer

  const assertAdmin = async (userID: string) => {
    const currentUser = await userDomain.findByID(userID)
    if (currentUser?.role !== Role.ADMIN) {
      throw Boom.forbidden('Forbidden')
    }
  }

  // Lisible par tout utilisateur authentifie : la numerotation des semaines
  // s'affiche pour tout le monde, seule sa configuration est reservee.
  fastify.get(
    '/',
    {
      schema: { response: { 200: planningCycleNullableResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    () => planningCycleDomain.find(),
  )

  // Enregistrer / mettre a jour (admin uniquement)
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
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      await assertAdmin(request.user.userID)
      return planningCycleDomain.save({
        startOfWeek: request.body.startOfWeek,
        weekCount: request.body.weekCount,
      })
    },
  )

  // Reinitialiser : le planning repasse en numerotation ISO (admin uniquement)
  fastify.delete(
    '/',
    {
      schema: {
        response: {
          204: z.null(),
          403: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      await assertAdmin(request.user.userID)
      await planningCycleDomain.delete()
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { planningCycleRouter }

import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import type {
  DeleteUserByIdParams,
  GetUserByIdParams,
  UpdateUserBody,
  UpdateUserParams,
} from '../schemas/user.schema'
import {
  deleteUserByIdParamsSchema,
  getUserByIdParamsSchema,
  updateUserByIdSchema,
  userResponseSchema,
  usersResponseSchema,
} from '../schemas/user.schema'

const userRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { userDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: usersResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return userDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetUserByIdParams }>(
    '/:userID',
    {
      schema: {
        params: getUserByIdParamsSchema,
        response: {
          200: userResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { userID } = request.params
      const user = await userDomain.findByID(userID)
      if (!user) {
        throw Boom.notFound('User not found')
      }
      return user
    },
  )

  // Update
  fastify.patch<{
    Params: UpdateUserParams
    Body: UpdateUserBody
  }>(
    '/:userID',
    {
      schema: {
        ...updateUserByIdSchema,
        response: {
          200: userResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { userID } = request.params
      const updated = await userDomain.update(userID, request.body)
      if (!updated) {
        throw Boom.notFound('User not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeleteUserByIdParams }>(
    '/:userID',
    {
      schema: {
        params: deleteUserByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { userID } = request.params
      const deleted = await userDomain.delete(userID)
      if (!deleted) {
        logger.info('User not found')
        throw Boom.notFound('User not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { userRouter }

import type { FastifyPluginAsync } from 'fastify'

import { toMeResponse } from '../../../../utils/me-mapper'
import {
  meResponseSchema,
  type UpdateMeBody,
  updateMeSchema,
} from '../schemas/me.schema'

const meRouter: FastifyPluginAsync = (fastify) => {
  const { userDomain, accessGrantRepository } = fastify.iocContainer

  fastify.get(
    '/',
    { schema: { response: { 200: meResponseSchema } } },
    async (request) => {
      const grants = await accessGrantRepository.findForUser(request.currentUser.id)
      return toMeResponse(request.currentUser, grants, new Date())
    },
  )

  fastify.patch<{ Body: UpdateMeBody }>(
    '/',
    { schema: { body: updateMeSchema, response: { 200: meResponseSchema } } },
    async (request) => {
      const { userID } = request.user
      const { firstName, lastName, currentPassword, newPassword } = request.body
      if (firstName !== undefined || lastName !== undefined) {
        await userDomain.updateProfile(userID, { firstName, lastName })
      }
      if (currentPassword !== undefined && newPassword !== undefined) {
        await userDomain.changePassword(userID, {
          currentPassword,
          newPassword,
        })
      }
      const [updated, grants] = await Promise.all([
        userDomain.findByID(userID),
        accessGrantRepository.findForUser(userID),
      ])
      return toMeResponse(updated, grants, new Date())
    },
  )
  return Promise.resolve()
}

export { meRouter }

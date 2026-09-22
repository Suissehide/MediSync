import type { FastifyPluginAsync } from 'fastify'

import { toMeResponse } from '../../../../utils/me-mapper'
import {
  meResponseSchema,
  type UpdateMeBody,
  updateMeSchema,
} from '../schemas/me.schema'

const meRouter: FastifyPluginAsync = (fastify) => {
  const { userDomain } = fastify.iocContainer

  fastify.get(
    '/',
    { schema: { response: { 200: meResponseSchema } } },
    (request) => toMeResponse(request.currentUser),
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
      return toMeResponse(await userDomain.findByID(userID))
    },
  )
  return Promise.resolve()
}

export { meRouter }

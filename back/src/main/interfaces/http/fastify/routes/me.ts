import type { FastifyPluginAsync } from 'fastify'

import { liveGrantsForUser } from '../../../../domain/accessGrant.domain'
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
      const grants = await liveGrantsForUser(
        request.currentUser.id,
        accessGrantRepository,
      )
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
      // `liveGrantsForUser` ne lit plus `isSuperAdmin` sur `updated` (tour de correction 1,
      // tâche 8) : `AccessGrantRepository.findForUser` relit ce drapeau lui-même, frais, à
      // l'instant de l'appel — la fraîcheur ne dépend donc plus de l'ordre entre les deux
      // lectures. `updated` reste nécessaire pour `toMeResponse` (l'arbre des appartenances).
      const updated = await userDomain.findByID(userID)
      const grants = await liveGrantsForUser(updated.id, accessGrantRepository)
      return toMeResponse(updated, grants, new Date())
    },
  )
  return Promise.resolve()
}

export { meRouter }

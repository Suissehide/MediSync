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
        request.currentUser,
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
      // Séquentiel, pas `Promise.all` : `liveGrantsForUser` a besoin du `isSuperAdmin` à jour de
      // `updated` (un profil peut changer entre deux requêtes) pour décider s'il vaut la peine de
      // lire les octrois — voir accessGrant.domain.ts.
      const updated = await userDomain.findByID(userID)
      const grants = await liveGrantsForUser(updated, accessGrantRepository)
      return toMeResponse(updated, grants, new Date())
    },
  )
  return Promise.resolve()
}

export { meRouter }

import Boom from '@hapi/boom'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'

import { liveGrantsForUser } from '../../../../domain/accessGrant.domain'
import { toMeResponse } from '../../../../utils/me-mapper'
import {
  meResponseSchema,
  type UpdateMeBody,
  updateMeSchema,
} from '../schemas/me.schema'
import {
  type NotificationPrefsBody,
  notificationPrefsSchema,
} from '../schemas/notification-prefs.schema'

const accountServices = (user: FastifyRequest['currentUser']): Set<string> =>
  new Set(
    user.establishmentMemberships.flatMap((e) =>
      e.serviceMemberships.map((s) => s.serviceId),
    ),
  )

const meRouter: FastifyPluginAsync = (fastify) => {
  const { userDomain, accessGrantRepository, userRepository } =
    fastify.iocContainer

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
      // `liveGrantsForUser` ne lit plus `isSuperAdmin` sur `updated` :
      // `AccessGrantRepository.findForUser` relit ce drapeau lui-même, frais, à
      // l'instant de l'appel — la fraîcheur ne dépend donc plus de l'ordre entre les deux
      // lectures. `updated` reste nécessaire pour `toMeResponse` (l'arbre des appartenances).
      const updated = await userDomain.findByID(userID)
      const grants = await liveGrantsForUser(updated.id, accessGrantRepository)
      return toMeResponse(updated, grants, new Date())
    },
  )

  fastify.get(
    '/notification-preferences',
    { schema: { response: { 200: notificationPrefsSchema } } },
    async (request) => {
      const prefs = await userRepository.findNotificationPrefs(
        request.currentUser.id,
      )
      // Un service quitte depuis l'enregistrement disparait ; plus aucun service = tous.
      const mine = accountServices(request.currentUser)
      const services = prefs.services?.filter((s) => mine.has(s)) ?? []
      return { ...prefs, services: services.length > 0 ? services : null }
    },
  )

  fastify.put<{ Body: NotificationPrefsBody }>(
    '/notification-preferences',
    {
      schema: {
        body: notificationPrefsSchema,
        response: { 200: notificationPrefsSchema },
      },
    },
    async (request) => {
      const mine = accountServices(request.currentUser)
      if (request.body.services?.some((s) => !mine.has(s))) {
        throw Boom.badRequest('Service is not one of the account services')
      }
      await userRepository.setNotificationPrefs(
        request.currentUser.id,
        request.body,
      )
      return request.body
    },
  )
  return Promise.resolve()
}

export { meRouter }

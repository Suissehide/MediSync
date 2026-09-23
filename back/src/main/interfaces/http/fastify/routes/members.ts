import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type AddMemberBody,
  addMemberSchema,
  type MemberParams,
  memberParamsSchema,
  memberResponseSchema,
  membersResponseSchema,
  type UpdateMemberBody,
  updateMemberSchema,
} from '../schemas/members.schema'

// Gestion des membres, sous le préfixe d'établissement :
// /e/:establishmentId/admin/members. `membershipId` ne sert qu'à charger
// l'appartenance par un repository filtré sur l'établissement courant : le
// client ne peut donc jamais désigner une appartenance d'un autre tenant.
const membersRouter: FastifyPluginAsync = (fastify) => {
  const { membershipDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: membersResponseSchema } },
      config: { permission: 'members:manage' },
    },
    () => membershipDomain.findAll(),
  )

  fastify.post<{ Body: AddMemberBody }>(
    '/',
    {
      schema: {
        body: addMemberSchema,
        response: { 201: memberResponseSchema },
      },
      config: { permission: 'members:manage' },
    },
    async (request, reply) => {
      const member = await membershipDomain.addByEmail(request.body)
      reply.code(201)
      return member
    },
  )

  fastify.patch<{ Params: MemberParams; Body: UpdateMemberBody }>(
    '/:membershipId',
    {
      schema: {
        params: memberParamsSchema,
        body: updateMemberSchema,
        response: { 200: memberResponseSchema },
      },
      config: { permission: 'members:manage' },
    },
    (request) =>
      membershipDomain.update(request.params.membershipId, request.body),
  )

  fastify.delete<{ Params: MemberParams }>(
    '/:membershipId',
    {
      schema: {
        params: memberParamsSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'members:manage' },
    },
    async (request, reply) => {
      await membershipDomain.remove(request.params.membershipId)
      reply.code(204).send()
    },
  )

  fastify.post<{ Params: MemberParams }>(
    '/:membershipId/deactivate',
    {
      schema: {
        params: memberParamsSchema,
        response: { 200: memberResponseSchema },
      },
      config: { permission: 'members:manage' },
    },
    (request) =>
      membershipDomain.setDeactivated(request.params.membershipId, true),
  )

  fastify.post<{ Params: MemberParams }>(
    '/:membershipId/reactivate',
    {
      schema: {
        params: memberParamsSchema,
        response: { 200: memberResponseSchema },
      },
      config: { permission: 'members:manage' },
    },
    (request) =>
      membershipDomain.setDeactivated(request.params.membershipId, false),
  )

  return Promise.resolve()
}

export { membersRouter }

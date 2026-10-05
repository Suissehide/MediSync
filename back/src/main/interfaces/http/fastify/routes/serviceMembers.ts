import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type InviteServiceMemberBody,
  inviteServiceMemberResponseSchema,
  inviteServiceMemberSchema,
  projectServiceMember,
  type ServiceMemberParams,
  type SetServiceRoleBody,
  type SetServiceSoignantBody,
  serviceMemberParamsSchema,
  serviceMemberResponseSchema,
  serviceMembersResponseSchema,
  setServiceRoleSchema,
  setServiceSoignantSchema,
} from '../schemas/serviceMembers.schema'

// Sous le prefixe de service : /e/:establishmentId/s/:serviceId/membres (2026-09-29).
//
// Les soignants sont propres a chaque service : le rattachement d'un membre a un soignant ne peut
// donc se regler que depuis le service, ou les deux sont lisibles (l'administration
// d'etablissement n'a pas de service en contexte, et le garde-fou de tenant lui refuse toute
// lecture d'un modele de service). La lecture suit `members:read` (tout membre du service voit
// qui y travaille), le rattachement a un soignant `referentials:write` (le coordinateur, comme
// pour les soignants eux-memes).
//
// L'equipe elle-meme — inviter, changer le role de service, retirer — suit
// `service-members:manage`, une permission a part : `referentials:write` vaut pour le
// parametrage, celle-ci accorde des DROITS, et il faut pouvoir l'oter sans oter l'autre. Son
// perimetre s'arrete au service courant ; les comptes et les rattachements d'etablissement
// restent a `members:manage`.
const serviceMembersRouter: FastifyPluginAsync = (fastify) => {
  const { membershipDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: serviceMembersResponseSchema } },
      config: { permission: 'members:read' },
    },
    async () =>
      (await membershipDomain.findServiceMembers()).map(projectServiceMember),
  )

  fastify.post<{ Body: InviteServiceMemberBody }>(
    '/',
    {
      schema: {
        body: inviteServiceMemberSchema,
        response: { 201: inviteServiceMemberResponseSchema },
      },
      config: { permission: 'service-members:manage' },
    },
    async (request, reply) => {
      const result = await membershipDomain.inviteToService(request.body)
      reply.code(201)
      return result
    },
  )

  fastify.patch<{ Params: ServiceMemberParams; Body: SetServiceRoleBody }>(
    '/:serviceMembershipId',
    {
      schema: {
        params: serviceMemberParamsSchema,
        body: setServiceRoleSchema,
        response: { 200: serviceMemberResponseSchema },
      },
      config: { permission: 'service-members:manage' },
    },
    async (request) =>
      projectServiceMember(
        await membershipDomain.setServiceMemberRole(
          request.params.serviceMembershipId,
          request.body.role,
        ),
      ),
  )

  fastify.delete<{ Params: ServiceMemberParams }>(
    '/:serviceMembershipId',
    {
      schema: {
        params: serviceMemberParamsSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'service-members:manage' },
    },
    async (request, reply) => {
      await membershipDomain.removeServiceMember(
        request.params.serviceMembershipId,
      )
      reply.code(204).send()
    },
  )

  fastify.patch<{ Params: ServiceMemberParams; Body: SetServiceSoignantBody }>(
    '/:serviceMembershipId/soignant',
    {
      schema: {
        params: serviceMemberParamsSchema,
        body: setServiceSoignantSchema,
        response: { 200: serviceMemberResponseSchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request) =>
      projectServiceMember(
        await membershipDomain.setServiceSoignant(
          request.params.serviceMembershipId,
          request.body.soignantId,
        ),
      ),
  )

  return Promise.resolve()
}

export { serviceMembersRouter }

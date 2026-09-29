import type { FastifyPluginAsync } from 'fastify'

import {
  projectServiceMember,
  type ServiceMemberParams,
  type SetServiceSoignantBody,
  serviceMemberParamsSchema,
  serviceMemberResponseSchema,
  serviceMembersResponseSchema,
  setServiceSoignantSchema,
} from '../schemas/serviceMembers.schema'

// Sous le prefixe de service : /e/:establishmentId/s/:serviceId/membres (2026-09-29).
//
// Les soignants sont propres a chaque service : le rattachement d'un membre a un soignant ne peut
// donc se regler que depuis le service, ou les deux sont lisibles (l'administration
// d'etablissement n'a pas de service en contexte, et le garde-fou de tenant lui refuse toute
// lecture d'un modele de service). La lecture suit `members:read` (tout membre du service voit
// qui y travaille), l'ecriture `referentials:write` (le coordinateur, comme pour les soignants
// eux-memes).
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

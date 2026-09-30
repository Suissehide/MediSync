import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type AddMemberBody,
  addMemberSchema,
  type CreateMemberAccountBody,
  createMemberAccountResponseSchema,
  createMemberAccountSchema,
  type MemberParams,
  memberAccessLinkResponseSchema,
  memberParamsSchema,
  memberResponseSchema,
  membersResponseSchema,
  projectCreatedMember,
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

  // Chemin réel : `POST /e/:establishmentId/admin/members/account` — la spec
  // l'écrit sans `/admin`, mais ce routeur est monté sous ce préfixe (establishment-admin.
  // routes.ts) et une route portant `:establishmentId` enregistrée hors de ces greffons fait
  // échouer le démarrage (`assertTenantShapedRoute`).
  //
  // La réponse est PROJETÉE ici, explicitement, sur les seules colonnes que l'appelant vient
  // d'écrire : `member.user` (nom stocké, identifiant du compte) resterait sinon un oracle
  // d'existence de comptes sur une adresse déjà connue — voir
  // `createMemberAccountResponseSchema`. Le schéma Zod l'élaguerait déjà à la sérialisation ;
  // la projection le dit à la lecture du code plutôt que de s'en remettre à cet effet de bord,
  // et `projectCreatedMember` est éprouvée à part (tant
  // qu'elle vivait en ligne ici, aucun test ne pouvait la tenir). ATTENTION, la limite est
  // mesurée, pas supposée : c'est le CONTENU de la projection qui est éprouvé, jamais SON
  // APPEL DEPUIS CETTE LIGNE — retirer `projectCreatedMember(...)` ci-dessous ne fait rougir
  // aucune des quatre portes, parce que Zod rend alors exactement la même réponse. Le
  // raisonnement complet est sur `projectCreatedMember` (`schemas/members.schema.ts`).
  fastify.post<{ Body: CreateMemberAccountBody }>(
    '/account',
    {
      schema: {
        body: createMemberAccountSchema,
        response: { 201: createMemberAccountResponseSchema },
      },
      config: { permission: 'members:manage' },
    },
    async (request, reply) => {
      const { member, accessLink } = await membershipDomain.createAccount(
        request.body,
      )
      reply.code(201)
      return { member: projectCreatedMember(member), accessLink }
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

  // Réémettre un lien — la réinitialisation d'un accès oublié, qui
  // n'existait par aucun moyen. Le client désigne une APPARTENANCE, jamais un compte : voir
  // `MembershipDomain.reissueAccessLink` pour ce que cette distinction protège.
  fastify.post<{ Params: MemberParams }>(
    '/:membershipId/access-link',
    {
      schema: {
        params: memberParamsSchema,
        response: { 201: memberAccessLinkResponseSchema },
      },
      config: { permission: 'members:manage' },
    },
    async (request, reply) => {
      const accessLink = await membershipDomain.reissueAccessLink(
        request.params.membershipId,
      )
      reply.code(201)
      return { accessLink }
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

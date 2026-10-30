import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateServiceFieldBody,
  type CreateServiceFieldChoiceBody,
  createServiceFieldChoiceByIdSchema,
  createServiceFieldSchema,
  type GetServiceFieldByIdParams,
  type ReorderServiceFieldChoicesBody,
  type ReorderServiceFieldsBody,
  reorderServiceFieldChoicesByIdSchema,
  reorderServiceFieldsSchema,
  type ServiceFieldChoiceParams,
  serviceFieldResponseSchema,
  serviceFieldsResponseSchema,
  toServiceFieldDto,
  type UpdateServiceFieldBody,
  type UpdateServiceFieldChoiceBody,
  type UpdateServiceFieldParams,
  updateServiceFieldByIdSchema,
  updateServiceFieldChoiceByIdSchema,
} from '../schemas/serviceField.schema'

const serviceFieldRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { serviceFieldDomain } = iocContainer

  // Get all (actifs et archivés : le coordinateur voit tout pour les restaurer)
  fastify.get(
    '/',
    {
      schema: { response: { 200: serviceFieldsResponseSchema } },
      config: { permission: 'referentials:read' },
    },
    async () => (await serviceFieldDomain.findAll()).map(toServiceFieldDto),
  )

  // Create
  fastify.post<{ Body: CreateServiceFieldBody }>(
    '/',
    {
      schema: {
        body: createServiceFieldSchema,
        response: { 201: serviceFieldResponseSchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const created = await serviceFieldDomain.create(request.body)
      reply.code(201)
      return toServiceFieldDto(created)
    },
  )

  // Update (label, unit, archivage) — key/type/clinical/section figés après création
  fastify.patch<{
    Params: UpdateServiceFieldParams
    Body: UpdateServiceFieldBody
  }>(
    '/:fieldID',
    {
      schema: {
        ...updateServiceFieldByIdSchema,
        response: {
          200: serviceFieldResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request) => {
      const { fieldID } = request.params
      return toServiceFieldDto(
        await serviceFieldDomain.update(fieldID, request.body),
      )
    },
  )

  // Ajout d'un choix
  fastify.post<{
    Params: GetServiceFieldByIdParams
    Body: CreateServiceFieldChoiceBody
  }>(
    '/:fieldID/choices',
    {
      schema: {
        ...createServiceFieldChoiceByIdSchema,
        response: {
          201: serviceFieldResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const { fieldID } = request.params
      const updated = await serviceFieldDomain.createChoice(
        fieldID,
        request.body.label,
      )
      reply.code(201)
      return toServiceFieldDto(updated)
    },
  )

  // Update d'un choix (label, archivage)
  fastify.patch<{
    Params: ServiceFieldChoiceParams
    Body: UpdateServiceFieldChoiceBody
  }>(
    '/:fieldID/choices/:choiceID',
    {
      schema: {
        ...updateServiceFieldChoiceByIdSchema,
        response: {
          200: serviceFieldResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request) => {
      const { fieldID, choiceID } = request.params
      return toServiceFieldDto(
        await serviceFieldDomain.updateChoice(fieldID, choiceID, request.body),
      )
    },
  )

  // Réordonne les champs d'une section
  fastify.put<{ Body: ReorderServiceFieldsBody }>(
    '/order',
    {
      schema: {
        body: reorderServiceFieldsSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await serviceFieldDomain.reorderFields(
        request.body.categoryId,
        request.body.ids,
      )
      reply.code(204).send()
    },
  )

  // Réordonne les choix d'un champ
  fastify.put<{
    Params: GetServiceFieldByIdParams
    Body: ReorderServiceFieldChoicesBody
  }>(
    '/:fieldID/choices/order',
    {
      schema: {
        ...reorderServiceFieldChoicesByIdSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const { fieldID } = request.params
      await serviceFieldDomain.reorderChoices(fieldID, request.body.ids)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { serviceFieldRouter }

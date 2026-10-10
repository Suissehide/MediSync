import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { MEASURE_CATALOG } from '../../../../utils/indicators/catalog'
import {
  type CreateIndicatorBody,
  type CreateIndicatorSetBody,
  createIndicatorSchema,
  createIndicatorSetSchema,
  indicatorCatalogResponseSchema,
  type IndicatorIdParams,
  indicatorIdParamsSchema,
  indicatorResponseSchema,
  indicatorSetDtoSchema,
  indicatorSetsResponseSchema,
  type ReorderBody,
  reorderSchema,
  type SetIdParams,
  setIdParamsSchema,
  type UpdateIndicatorBody,
  type UpdateIndicatorSetBody,
  updateIndicatorSchema,
  updateIndicatorSetSchema,
} from '../schemas/indicatorSet.schema'

const indicatorSetRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { indicatorSetDomain } = iocContainer

  // Jeux actifs et archivés : le coordinateur voit tout pour les restaurer.
  fastify.get(
    '/',
    {
      schema: { response: { 200: indicatorSetsResponseSchema } },
      config: { permission: 'stats:read' },
    },
    () => indicatorSetDomain.findAll(),
  )

  fastify.post<{ Body: CreateIndicatorSetBody }>(
    '/',
    {
      schema: {
        body: createIndicatorSetSchema,
        response: { 201: indicatorSetDtoSchema },
      },
      config: { permission: 'stats:write' },
    },
    async (request, reply) => {
      const created = await indicatorSetDomain.create(request.body)
      reply.code(201)
      return created
    },
  )

  fastify.patch<{ Params: SetIdParams; Body: UpdateIndicatorSetBody }>(
    '/:setId',
    {
      schema: {
        params: setIdParamsSchema,
        body: updateIndicatorSetSchema,
        response: { 200: indicatorSetDtoSchema },
      },
      config: { permission: 'stats:write' },
    },
    (request) => indicatorSetDomain.update(request.params.setId, request.body),
  )

  fastify.put<{ Body: ReorderBody }>(
    '/order',
    {
      schema: { body: reorderSchema, response: { 204: z.null() } },
      config: { permission: 'stats:write' },
    },
    async (request, reply) => {
      await indicatorSetDomain.reorder(request.body.ids)
      reply.code(204).send()
    },
  )

  fastify.post<{ Params: SetIdParams; Body: CreateIndicatorBody }>(
    '/:setId/indicators',
    {
      schema: {
        params: setIdParamsSchema,
        body: createIndicatorSchema,
        response: { 201: indicatorResponseSchema },
      },
      config: { permission: 'stats:write' },
    },
    async (request, reply) => {
      const created = await indicatorSetDomain.createIndicator(
        request.params.setId,
        request.body,
      )
      reply.code(201)
      return created
    },
  )

  fastify.patch<{ Params: IndicatorIdParams; Body: UpdateIndicatorBody }>(
    '/:setId/indicators/:indicatorId',
    {
      schema: {
        params: indicatorIdParamsSchema,
        body: updateIndicatorSchema,
        response: { 200: indicatorResponseSchema },
      },
      config: { permission: 'stats:write' },
    },
    (request) =>
      indicatorSetDomain.updateIndicator(
        request.params.setId,
        request.params.indicatorId,
        request.body,
      ),
  )

  fastify.put<{ Params: SetIdParams; Body: ReorderBody }>(
    '/:setId/indicators/order',
    {
      schema: {
        params: setIdParamsSchema,
        body: reorderSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'stats:write' },
    },
    async (request, reply) => {
      await indicatorSetDomain.reorderIndicators(
        request.params.setId,
        request.body.ids,
      )
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

// Catalogue des mesures disponibles : lecture seule, pas de jeu en jeu — greffon séparé pour
// rester monté hors du préfixe `/indicator-sets` (brief tâche 4).
const indicatorCatalogRouter: FastifyPluginAsync = (fastify) => {
  fastify.get(
    '/',
    {
      schema: { response: { 200: indicatorCatalogResponseSchema } },
      config: { permission: 'stats:read' },
    },
    () => MEASURE_CATALOG,
  )
  return Promise.resolve()
}

export { indicatorCatalogRouter, indicatorSetRouter }

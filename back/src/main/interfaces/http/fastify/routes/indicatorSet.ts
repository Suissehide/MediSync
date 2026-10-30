import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { MEASURE_CATALOG } from '../../../../utils/indicators/catalog'
import { withArchived } from '../schemas/index'
import {
  type AnswerBody,
  type AnswerParams,
  answerBodySchema,
  answerParamsSchema,
  answerResponseSchema,
  type CreateIndicatorBody,
  type CreateIndicatorSetBody,
  createIndicatorSchema,
  createIndicatorSetSchema,
  type IndicatorIdParams,
  indicatorCatalogResponseSchema,
  indicatorIdParamsSchema,
  indicatorResponseSchema,
  indicatorSetDtoSchema,
  indicatorSetsResponseSchema,
  type PreviewBody,
  previewBodySchema,
  previewResponseSchema,
  type RangeQuery,
  type ReorderBody,
  rangeQuerySchema,
  reorderSchema,
  resultsResponseSchema,
  type SetIdParams,
  setIdParamsSchema,
  toIndicatorSetDto,
  type UpdateIndicatorBody,
  type UpdateIndicatorSetBody,
  updateIndicatorSchema,
  updateIndicatorSetSchema,
} from '../schemas/indicatorSet.schema'

const jour = (d: Date): string => d.toISOString().slice(0, 10)

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
    async () => (await indicatorSetDomain.findAll()).map(toIndicatorSetDto),
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
      return toIndicatorSetDto(created)
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
    async (request) =>
      toIndicatorSetDto(
        await indicatorSetDomain.update(request.params.setId, request.body),
      ),
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
      return withArchived(created)
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
    async (request) =>
      withArchived(
        await indicatorSetDomain.updateIndicator(
          request.params.setId,
          request.params.indicatorId,
          request.body,
        ),
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

  // Chiffres agrégés du jeu, aucune donnée nominative (MDS-26).
  fastify.get<{ Params: SetIdParams; Querystring: RangeQuery }>(
    '/:setId/results',
    {
      schema: {
        params: setIdParamsSchema,
        querystring: rangeQuerySchema,
        response: { 200: resultsResponseSchema },
      },
      config: { permission: 'stats:read' },
    },
    async (request) => {
      const { from, to } = request.query
      return {
        from: jour(from),
        to: jour(to),
        ...(await indicatorSetDomain.results(request.params.setId, {
          from,
          to,
        })),
      }
    },
  )

  fastify.put<{ Params: AnswerParams; Body: AnswerBody }>(
    '/:setId/answers/:year/:indicatorId',
    {
      schema: {
        params: answerParamsSchema,
        body: answerBodySchema,
        response: { 200: answerResponseSchema },
      },
      config: { permission: 'stats:write' },
    },
    (request) =>
      indicatorSetDomain.saveAnswer(
        request.params.setId,
        request.params.year,
        request.params.indicatorId,
        request.body,
        request.user.userID,
      ),
  )

  fastify.post<{ Params: SetIdParams; Body: PreviewBody }>(
    '/:setId/preview',
    {
      schema: {
        params: setIdParamsSchema,
        body: previewBodySchema,
        response: { 200: previewResponseSchema },
      },
      config: { permission: 'stats:write' },
    },
    (request) => {
      const { indicator, from, to } = request.body
      return indicatorSetDomain.preview(request.params.setId, indicator, {
        from,
        to,
      })
    },
  )

  // Le classeur est un Buffer : pas de `response` Zod, la sérialisation JSON ne s'y applique pas.
  fastify.get<{ Params: SetIdParams; Querystring: RangeQuery }>(
    '/:setId/export',
    {
      schema: { params: setIdParamsSchema, querystring: rangeQuerySchema },
      config: { permission: 'stats:read' },
    },
    async (request, reply) => {
      const { from, to } = request.query
      const buffer = await indicatorSetDomain.exportExcel(
        request.params.setId,
        { from, to },
      )
      await reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header(
          'Content-Disposition',
          `attachment; filename="indicateurs_${jour(from)}_${jour(to)}.xlsx"`,
        )
        .send(buffer)
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

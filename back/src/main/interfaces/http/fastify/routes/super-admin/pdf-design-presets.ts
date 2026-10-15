import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreatePdfDesignPresetBody,
  createPdfDesignPresetSchema,
  type ListPdfDesignPresetsQuery,
  listPdfDesignPresetsQuerySchema,
  type PdfDesignPresetIdParams,
  pdfDesignPresetIdParamsSchema,
  pdfDesignPresetListResponseSchema,
  pdfDesignPresetSummarySchema,
  type ReorderPdfDesignPresetsBody,
  reorderPdfDesignPresetsSchema,
  type UpdatePdfDesignPresetBody,
  updatePdfDesignPresetSchema,
} from '../../schemas/pdf-design-preset.schema'

// Les modeles livres, geres par le super-admin seul. Herite de
// `assertRoutePermission`/`requireSuperAdmin` (super-admin.routes.ts) comme ses soeurs : la
// permission declaree ne sert qu'a satisfaire le garde-fou de demarrage, c'est le drapeau
// `isSuperAdmin` qui ferme l'acces, par un 404 et jamais un 403.
const pdfDesignPresetsRouter: FastifyPluginAsync = (fastify) => {
  const { pdfDesignPresetDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ListPdfDesignPresetsQuery }>(
    '/',
    {
      schema: {
        querystring: listPdfDesignPresetsQuerySchema,
        response: { 200: pdfDesignPresetListResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    (request) => pdfDesignPresetDomain.findAll(request.query.archived),
  )

  // Duplication d'un modele existant, ou modele vierge si aucune source n'est nommee.
  fastify.post<{ Body: CreatePdfDesignPresetBody }>(
    '/',
    {
      schema: {
        body: createPdfDesignPresetSchema,
        response: {
          201: pdfDesignPresetSummarySchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      const preset = await pdfDesignPresetDomain.create(request.body)
      reply.code(201)
      return preset
    },
  )

  // Posee AVANT `/:presetID` : Fastify fait gagner le litteral sur le parametre, mais l'ordre
  // de declaration rend l'intention lisible.
  fastify.put<{ Body: ReorderPdfDesignPresetsBody }>(
    '/reorder',
    {
      schema: {
        body: reorderPdfDesignPresetsSchema,
        response: { 204: z.null(), 400: z.object({ message: z.string() }) },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      await pdfDesignPresetDomain.reorder(request.body.ids)
      reply.code(204).send()
    },
  )

  fastify.patch<{
    Params: PdfDesignPresetIdParams
    Body: UpdatePdfDesignPresetBody
  }>(
    '/:presetID',
    {
      schema: {
        params: pdfDesignPresetIdParamsSchema,
        body: updatePdfDesignPresetSchema,
        response: {
          200: pdfDesignPresetSummarySchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'establishments:manage' },
    },
    (request) =>
      pdfDesignPresetDomain.update(request.params.presetID, request.body),
  )

  // Suppression = archivage ; la restauration passe par PATCH { archived: false }.
  fastify.delete<{ Params: PdfDesignPresetIdParams }>(
    '/:presetID',
    {
      schema: {
        params: pdfDesignPresetIdParamsSchema,
        response: { 204: z.null(), 404: z.object({ message: z.string() }) },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      await pdfDesignPresetDomain.archive(request.params.presetID)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { pdfDesignPresetsRouter }

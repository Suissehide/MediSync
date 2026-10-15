import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreatePdfDesignBody,
  createPdfDesignSchema,
  type ListPdfDesignsQuery,
  listPdfDesignsQuerySchema,
  type PdfDesignIdParams,
  pdfDesignIdParamsSchema,
  pdfDesignListResponseSchema,
  pdfDesignSummarySchema,
  type UpdatePdfDesignBody,
  updatePdfDesignSchema,
} from '../schemas/pdf-design.schema'

// Les presets globaux et les designs du service, en une reponse. `referentials:read` est dans
// READ_ALL, donc accordee a tous les roles de service : quiconque detient `pdf:export` peut
// choisir un design.
const pdfDesignReadRouter: FastifyPluginAsync = (fastify) => {
  const { pdfDesignDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ListPdfDesignsQuery }>(
    '/',
    {
      schema: {
        querystring: listPdfDesignsQuerySchema,
        response: { 200: pdfDesignListResponseSchema },
      },
      config: { permission: 'referentials:read' },
    },
    (request) => pdfDesignDomain.findAllForService(request.query.archived),
  )

  return Promise.resolve()
}

// Ecriture sous le meme prefixe, sur `referentials:write` comme les autres referentiels du
// service : c'est le coordinateur qui compose les designs.
const pdfDesignWriteRouter: FastifyPluginAsync = (fastify) => {
  const { pdfDesignDomain } = fastify.iocContainer

  // Duplication d'un preset, ou design vierge si aucun n'est nomme.
  fastify.post<{ Body: CreatePdfDesignBody }>(
    '/',
    {
      schema: {
        body: createPdfDesignSchema,
        response: {
          201: pdfDesignSummarySchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const design = await pdfDesignDomain.create(request.body)
      reply.code(201)
      return design
    },
  )

  fastify.patch<{ Params: PdfDesignIdParams; Body: UpdatePdfDesignBody }>(
    '/:designID',
    {
      schema: {
        params: pdfDesignIdParamsSchema,
        body: updatePdfDesignSchema,
        response: {
          200: pdfDesignSummarySchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    (request) => pdfDesignDomain.update(request.params.designID, request.body),
  )

  // Suppression = archivage (la restauration passe par PATCH { archived: false }).
  fastify.delete<{ Params: PdfDesignIdParams }>(
    '/:designID',
    {
      schema: {
        params: pdfDesignIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await pdfDesignDomain.archive(request.params.designID)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { pdfDesignReadRouter, pdfDesignWriteRouter }

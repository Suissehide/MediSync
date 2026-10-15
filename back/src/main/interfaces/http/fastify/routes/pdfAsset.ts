import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreatePdfAssetBody,
  createPdfAssetSchema,
  type PdfAssetIdParams,
  pdfAssetBytesResponseSchema,
  pdfAssetIdParamsSchema,
  pdfAssetListResponseSchema,
  pdfAssetSummarySchema,
  TAILLE_MAXIMALE_OCTETS,
} from '../schemas/pdf-asset.schema'

// `bodyLimit` releve pour CETTE route seule : Fastify plafonne les corps a 1 Mo, et 2 Mo
// d'image font ~2,7 Mo de base64 — mesure : sans ce reglage, deposer une image de 2 Mo repond
// 413 sans dire laquelle des deux limites a saute.
//
// LA MARGE N'EST PAS DECORATIVE, et ce plafond ne remplace PAS un controle cote front. Un corps
// au-dela de `bodyLimit` est refuse par Fastify AVANT le schema, donc sans le message qui nomme
// la limite : seule la bande entre la borne de Zod et ce plafond rend ce message. La marge d'un
// demi-megaoctet donne a cette bande une largeur utile — une image un peu trop grosse recoit
// l'explication — mais une image de 10 Mo recevra toujours un 413 nu. C'est pourquoi le front
// refuse AVANT d'envoyer (voir `TAILLE_MAXIMALE_IMAGE` cote front) : la seule facon d'expliquer
// un fichier de 10 Mo est de ne pas le televerser.
const LIMITE_DE_CORPS = Math.ceil((TAILLE_MAXIMALE_OCTETS * 4) / 3) + 512 * 1024

// `referentials:read` est dans READ_ALL : quiconque exporte un PDF doit pouvoir en lire les
// images.
const pdfAssetReadRouter: FastifyPluginAsync = (fastify) => {
  const { pdfAssetDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: pdfAssetListResponseSchema } },
      config: { permission: 'referentials:read' },
    },
    () => pdfAssetDomain.findAllForService(),
  )

  fastify.get<{ Params: PdfAssetIdParams }>(
    '/:assetID',
    {
      schema: {
        params: pdfAssetIdParamsSchema,
        response: {
          200: pdfAssetBytesResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    (request) => pdfAssetDomain.findByID(request.params.assetID),
  )

  return Promise.resolve()
}

// Deposer une image est une modification de referentiel, comme composer un design.
const pdfAssetWriteRouter: FastifyPluginAsync = (fastify) => {
  const { pdfAssetDomain } = fastify.iocContainer

  fastify.post<{ Body: CreatePdfAssetBody }>(
    '/',
    {
      bodyLimit: LIMITE_DE_CORPS,
      schema: {
        body: createPdfAssetSchema,
        response: { 201: pdfAssetSummarySchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const asset = await pdfAssetDomain.create(request.body)
      reply.code(201)
      return asset
    },
  )

  return Promise.resolve()
}

export { pdfAssetReadRouter, pdfAssetWriteRouter }

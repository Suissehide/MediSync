import type { FastifyPluginAsync } from 'fastify'

import { pdfDesignListResponseSchema } from '../schemas/pdf-design.schema'

// Lecture seule a cette etape : les presets globaux et les designs du service, en une reponse.
// `referentials:read` est dans READ_ALL, donc accordee a tous les roles de service : quiconque
// detient `pdf:export` peut choisir un design.
const pdfDesignReadRouter: FastifyPluginAsync = (fastify) => {
  const { pdfDesignDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: pdfDesignListResponseSchema } },
      config: { permission: 'referentials:read' },
    },
    () => pdfDesignDomain.findAllForService(),
  )

  return Promise.resolve()
}

export { pdfDesignReadRouter }

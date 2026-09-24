import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type PatientServiceFileParams,
  patientServiceFileParamsSchema,
  patientServiceFileResponseSchema,
  type UpsertPatientServiceFileBody,
  upsertPatientServiceFileBodySchema,
} from '../schemas/patientServiceFile.schema'

// Sous-dossier d'un patient dans ce service : identite partagee sur Patient, parcours et
// contenu clinique ici (etape 3 du multi-tenant). Meme permissions que le patient
// (`patient:read`/`patient:write`) — aucune permission nouvelle, comme prevu par la conception.
const patientServiceFileRouter: FastifyPluginAsync = (fastify) => {
  const { patientServiceFileDomain } = fastify.iocContainer

  // Lecture du sous-dossier. 404 tant qu'aucune ecriture n'a encore cree de
  // sous-dossier pour ce patient dans ce service.
  fastify.get<{ Params: PatientServiceFileParams }>(
    '/',
    {
      schema: {
        params: patientServiceFileParamsSchema,
        response: {
          200: patientServiceFileResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:read' },
    },
    async (request) => {
      const { patientID } = request.params
      const serviceFile = await patientServiceFileDomain.findByPatient(patientID)
      if (!serviceFile) {
        throw Boom.notFound('Patient service file not found')
      }
      return serviceFile
    },
  )

  // Ecriture : cree le sous-dossier a la premiere ecriture, le met a jour
  // ensuite (upsert). Seul point de creation, voir le repository.
  fastify.put<{ Params: PatientServiceFileParams; Body: UpsertPatientServiceFileBody }>(
    '/',
    {
      schema: {
        params: patientServiceFileParamsSchema,
        body: upsertPatientServiceFileBodySchema,
        response: {
          200: patientServiceFileResponseSchema,
        },
      },
      config: { permission: 'patient:write' },
    },
    (request) => {
      const { patientID } = request.params
      return patientServiceFileDomain.upsert(patientID, request.body)
    },
  )

  return Promise.resolve()
}

export { patientServiceFileRouter }

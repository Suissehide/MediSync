import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  attachPatientToCurrentServiceResponseSchema,
  type PatientServiceFileParams,
  patientServiceFileParamsSchema,
  patientServiceFileResponseSchema,
  type UpsertPatientServiceFileBody,
  upsertPatientServiceFileBodySchema,
} from '../schemas/patientServiceFile.schema'

// Sous-dossier d'un patient dans ce service : identite partagee sur Patient, parcours et
// contenu clinique ici. Meme permissions que le patient
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
      const serviceFile =
        await patientServiceFileDomain.findByPatient(patientID)
      if (!serviceFile) {
        throw Boom.notFound('Patient service file not found')
      }
      return serviceFile
    },
  )

  // Rattachement d'une identite existante au service courant (design §6) : choisir un
  // resultat de la recherche d'identite (GET /patient/search) mene ici, pas vers POST /patient —
  // aucune ecriture sur l'identite partagee (Patient), seulement la creation du sous-dossier
  // dans ce service s'il n'existe pas deja. Meme permission que l'ecriture du sous-dossier
  // (`patient:write`) : ce n'est jamais qu'une facon de l'amorcer.
  fastify.post<{ Params: PatientServiceFileParams }>(
    '/',
    {
      schema: {
        params: patientServiceFileParamsSchema,
        response: {
          200: attachPatientToCurrentServiceResponseSchema,
        },
      },
      config: { permission: 'patient:write' },
    },
    (request) => {
      const { patientID } = request.params
      return patientServiceFileDomain.attachToCurrentService(
        patientID,
        request.user.userID,
      )
    },
  )

  // Ecriture : cree le sous-dossier a la premiere ecriture, le met a jour ensuite (upsert) ;
  // voir aussi ensureExists (patientServiceFile.domain.ts) pour l'autre point de creation, a
  // l'inscription dans un parcours.
  //
  // PATCH, pas PUT : les seize champs sont facultatifs et `update: params` (repository) laisse
  // Prisma ignorer les cles absentes — une charge partielle fait une mise a jour partielle, ce
  // que PUT ne promet pas. Un vrai PUT serait de plus dangereux ici : `stripClinicalInput`
  // retire notes/details/medicalDiagnosis du corps d'un secretariat pour laisser ces colonnes
  // inchangees (voir utils/clinical-fields.ts) ; en semantique de remplacement, une cle
  // absente vaudrait "mets a null", et le secretariat effacerait donc ces trois champs a chaque
  // enregistrement — exactement la perte que ce crochet existe pour empecher. Aucun appelant du
  // depot ne compte sur un remplacement complet.
  fastify.patch<{
    Params: PatientServiceFileParams
    Body: UpsertPatientServiceFileBody
  }>(
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
      return patientServiceFileDomain.upsert(
        patientID,
        request.body,
        request.user.userID,
      )
    },
  )

  return Promise.resolve()
}

export { patientServiceFileRouter }

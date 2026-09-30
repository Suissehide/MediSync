import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { hasPermission } from '../../../../utils/permissions'
import { requireTenant } from '../plugins/tenant.plugin'
import {
  appointmentsCountResponseSchema,
  type CreatePatientBody,
  createPatientSchema,
  type DeletePatientByIdParams,
  deletePatientByIdParamsSchema,
  type EnrollExistingPatientInPathwaysBody,
  type EnrollPatientInPathwaysBody,
  enrollExistingPatientInPathwaysSchema,
  enrollmentResultSchema,
  enrollPatientInPathwaysSchema,
  type GetPatientByIdParams,
  getPatientByIdParamsSchema,
  type PatientPathwayParams,
  patientDetailResponseSchema,
  patientIdentitySearchResponseSchema,
  patientPathwayParamsSchema,
  patientPathwaysResponseSchema,
  patientResponseSchema,
  patientsResponseSchema,
  patientsWithTagsResponseSchema,
  type ReorderPatientPathwaysBody,
  removeFromPathwayResponseSchema,
  reorderPatientPathwaysBodySchema,
  type SearchPatientIdentityQuery,
  searchPatientIdentityQuerySchema,
  type UpdatePatientBody,
  type UpdatePatientParams,
  updatePatientByIdSchema,
} from '../schemas/patient.schema'

const patientRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { patientDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: patientsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:read' },
    },
    () => {
      return patientDomain.findAll()
    },
  )

  // Export patients as Excel (must be before /:patientID)
  fastify.get(
    '/export',
    {
      schema: {
        querystring: z.object({
          search: z.string().optional(),
          pathwayTemplateTags: z
            .union([z.string(), z.array(z.string())])
            .optional(),
        }),
      },
      config: { permission: 'patient:read' },
    },
    async (request, reply) => {
      const { search, pathwayTemplateTags } = request.query as {
        search?: string
        pathwayTemplateTags?: string | string[]
      }

      const tags = pathwayTemplateTags
        ? Array.isArray(pathwayTemplateTags)
          ? pathwayTemplateTags
          : [pathwayTemplateTags]
        : []

      // L'export est un Buffer : le hook `preSerialization` qui retire les
      // champs cliniques des réponses JSON ne s'y applique pas, il faut donc
      // décider ici de la présence des colonnes cliniques.
      const { serviceRole, establishmentRole } = requireTenant(request)
      const { buffer, count } = await patientDomain.exportExcel(
        { search, pathwayTemplateTags: tags },
        {
          includeClinicalFields: hasPermission(
            { serviceRole, establishmentRole },
            'clinical:read',
          ),
        },
      )
      // Journal des consultations : cette route n'a aucun identifiant de
      // patient dans son URL, donc `recordPatientAccess` (onResponse, plugins/tenant.plugin.ts)
      // ne peut pas savoir combien de dossiers l'export a rendus sans le lire ici -- c'est le
      // SEUL endroit qui le sait. Pose AVANT de repondre : le crochet `onResponse` s'execute
      // apres l'envoi de la reponse, donc apres ce point de toute facon.
      request.patientExportCount = count

      const filename = `patients_${new Date().toISOString().slice(0, 10)}.xlsx`
      await reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer)
    },
  )

  // Recherche d'identite existante avant creation (design §6, must be before
  // /:patientID). Meme permission que la lecture du patient (`patient:read`) : aucune permission
  // nouvelle — un secretariat obtient exactement la meme reponse qu'un coordinateur, la
  // recherche ne portant aucun champ clinique (verifie par
  // patient-search-identite.test.ts).
  //
  // Ce qui tient reellement la forme de la reponse : le corps
  // HTTP effectivement rendu, verifie par `patient-search-identite.test.ts`
  // (`expect(Object.keys(match).sort()).toEqual([...])` sur la reponse reelle, pas sur un type).
  // Le `select` du depot (`PatientRepository.searchByIdentity`) et
  // `patientIdentitySearchResponseSchema` ci-dessous y contribuent tous les deux, mais ni l'un
  // ni l'autre ne tient seul, a l'epreuve : un `select` elargi d'une colonne passe le
  // compilateur (Prisma retourne un objet plus riche que le type declare, et l'assignation n'est
  // pas un litteral frais — TypeScript ne verifie pas les proprietes en trop dans ce cas), et
  // Zod/fast-json-stringify le rattrapent silencieusement en serialisation ; a l'inverse, retirer
  // le schema de reponse ne fuit rien tant que le `select` reste etroit. Seul le retrait des DEUX
  // a la fois fait rougir un test. Ce n'est pas une faiblesse a corriger en testant chaque couche
  // isolement : une defense en profondeur qu'on eprouve couche par couche ne prouve que sa
  // propre redondance, pas la propriete qui compte — celle-ci est eprouvee au niveau ou elle
  // s'observe, le corps de la reponse HTTP.
  //
  fastify.get<{ Querystring: SearchPatientIdentityQuery }>(
    '/search',
    {
      schema: {
        querystring: searchPatientIdentityQuerySchema,
        response: {
          200: patientIdentitySearchResponseSchema,
        },
      },
      config: { permission: 'patient:read' },
    },
    (request) => {
      const { firstName, lastName, birthDate } = request.query
      return patientDomain.searchByIdentity({ firstName, lastName, birthDate })
    },
  )

  // Get all with pathway template tags (must be before /:patientID)
  fastify.get(
    '/with-tags',
    {
      schema: {
        response: { 200: patientsWithTagsResponseSchema },
      },
      config: { permission: 'patient:read' },
    },
    () => patientDomain.findAllWithTags(),
  )

  // Read by ID
  fastify.get<{ Params: GetPatientByIdParams }>(
    '/:patientID',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        response: {
          200: patientDetailResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:read' },
    },
    async (request) => {
      const { patientID } = request.params
      const patient = await patientDomain.findByID(patientID)
      if (!patient) {
        throw Boom.notFound('Patient not found')
      }
      return patient
    },
  )

  // Create
  fastify.post<{ Body: CreatePatientBody }>(
    '/',
    {
      schema: {
        body: createPatientSchema,
        response: {
          201: patientResponseSchema,
        },
      },
      config: { permission: 'patient:write' },
    },
    async (request, reply) => {
      const patient = await patientDomain.create(
        request.body,
        request.user.userID,
      )
      reply.code(201)
      return patient
    },
  )

  // Update
  fastify.patch<{ Params: UpdatePatientParams; Body: UpdatePatientBody }>(
    '/:patientID',
    {
      schema: {
        ...updatePatientByIdSchema,
        response: {
          200: patientResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:write' },
    },
    async (request) => {
      const { patientID } = request.params
      const updated = await patientDomain.update(
        patientID,
        request.body,
        request.user.userID,
      )
      if (!updated) {
        throw Boom.notFound('Patient not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeletePatientByIdParams }>(
    '/:patientID',
    {
      schema: {
        params: deletePatientByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:delete' },
    },
    async (request, reply) => {
      const { patientID } = request.params
      const deleted = await patientDomain.delete(patientID, request.user.userID)
      if (!deleted) {
        logger.info('Patient not found')
        throw Boom.notFound('Patient not found')
      }
      reply.code(204).send()
    },
  )

  fastify.post<{ Body: EnrollPatientInPathwaysBody }>(
    '/enroll',
    {
      schema: {
        body: enrollPatientInPathwaysSchema,
        response: {
          201: enrollmentResultSchema,
          400: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'appointment:write' },
    },
    async (request, reply) => {
      const result = await patientDomain.enrollPatientInPathways(
        {
          patientData: request.body.patientData,
          startDate: request.body.startDate,
          pathways: request.body.pathways,
        },
        request.user.userID,
      )
      reply.code(201)
      return result
    },
  )

  fastify.post<{ Body: EnrollExistingPatientInPathwaysBody }>(
    '/:patientID/enroll',
    {
      schema: {
        body: enrollExistingPatientInPathwaysSchema,
        response: {
          200: enrollmentResultSchema,
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'appointment:write' },
    },
    async (request) => {
      return await patientDomain.enrollExistingPatientInPathways(
        {
          patientID: request.body.patientID,
          startDate: request.body.startDate,
          pathways: request.body.pathways,
        },
        request.user.userID,
      )
    },
  )

  // Count appointments for patient in pathway (for confirmation modal)
  fastify.get<{ Params: PatientPathwayParams }>(
    '/:patientID/pathway/:pathwayID/appointments-count',
    {
      schema: {
        params: patientPathwayParamsSchema,
        response: {
          200: appointmentsCountResponseSchema,
        },
      },
      config: { permission: 'patient:read' },
    },
    (request) => {
      const { patientID, pathwayID } = request.params
      return patientDomain.countAppointmentsInPathway(patientID, pathwayID)
    },
  )

  // Remove patient from pathway
  fastify.delete<{ Params: PatientPathwayParams }>(
    '/:patientID/pathway/:pathwayID',
    {
      schema: {
        params: patientPathwayParamsSchema,
        response: {
          200: removeFromPathwayResponseSchema,
        },
      },
      config: { permission: 'appointment:write' },
    },
    (request) => {
      const { patientID, pathwayID } = request.params
      return patientDomain.removeFromPathway(
        patientID,
        pathwayID,
        request.user.userID,
      )
    },
  )

  // Get all pathways for a patient (with priority order)
  fastify.get<{ Params: GetPatientByIdParams }>(
    '/:patientID/pathways',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        response: {
          200: patientPathwaysResponseSchema,
        },
      },
      config: { permission: 'patient:read' },
    },
    (request) => {
      return patientDomain.getPathways(request.params.patientID)
    },
  )

  // Reorder patient pathways by priority
  fastify.put<{
    Params: GetPatientByIdParams
    Body: ReorderPatientPathwaysBody
  }>(
    '/:patientID/pathway-priorities',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        body: reorderPatientPathwaysBodySchema,
        response: {
          204: z.null(),
        },
      },
      config: { permission: 'patient:write' },
    },
    async (request, reply) => {
      await patientDomain.setPathwayPriorities(
        request.params.patientID,
        request.body.pathwayIDs,
      )
      return reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { patientRouter }

import type { FastifyPluginAsync } from 'fastify'

import {
  type SuperAdminAccessLogEntry,
  type SuperAdminAccessLogQuery,
  superAdminAccessLogQuerySchema,
  superAdminAccessLogsResponseSchema,
} from '../../schemas/superAdminAccessLog.schema'

// Tache 6, etape 4b : `GET /super-admin/access-log`. Ferme DEUX trous laisses par l'etape
// precedente (tache 1 a 5) :
//   - les lignes ecrites par le script d'amorcage (`UserDomain.bootstrapSuperAdmin`, sous
//     `runAsSystem`, `establishmentId: null`) n'etaient lisibles par AUCUNE route -- ni la
//     lecture d'etablissement (`establishment.repository.ts#activityLogFor`, qui exige un
//     `establishmentId` precis), ni le tenant ordinaire (`activityLog.repository.ts#findMany`,
//     qui n'existe que sous un tenant) ;
//   - aucune route ne lisait le journal des CONSULTATIONS (`PatientAccessLog`) a l'echelle de la
//     plateforme -- les deux routes voisines (`GET /e/:e/s/:s/patient/:patientID/acces`,
//     `GET /e/:e/admin/patients/:patientID/acces`) desigent toutes deux UN patient precis.
//
// Herite de `assertRoutePermission`/`requireSuperAdmin` (super-admin.routes.ts), comme
// `establishmentsRouter`/`usersRouter` : rien a repeter ici.
const accessLogRouter: FastifyPluginAsync = (fastify) => {
  const { activityLogDomain, patientAccessLogDomain } = fastify.iocContainer

  fastify.get<{ Querystring: SuperAdminAccessLogQuery }>(
    '/',
    {
      schema: {
        querystring: superAdminAccessLogQuerySchema,
        response: { 200: superAdminAccessLogsResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request): Promise<SuperAdminAccessLogEntry[]> => {
      const { source, establishmentId, userID, action } = request.query
      const filters = { establishmentId, userID, action }

      if (source === 'activite') {
        const rows = await activityLogDomain.findAllPlatformWide(filters)
        return rows.map((row) => ({
          id: row.id,
          source: 'activite' as const,
          establishmentId: row.establishmentId,
          serviceId: row.serviceId,
          userID: row.userID,
          userFirstName: row.userFirstName,
          userLastName: row.userLastName,
          action: row.action,
          createdAt: row.createdAt,
          entityType: row.entityType,
          entityID: row.entityID,
          patientId: null,
        }))
      }

      // `source === 'acces'` : PatientAccessLog. Construction CHAMP PAR CHAMP (jamais `...row`) --
      // voir le commentaire du schema de reponse pour pourquoi (`exportFilters`, `accesParOctroi`
      // ne doivent jamais atteindre ce DTO).
      const rows = await patientAccessLogDomain.findAllPlatformWide(filters)
      return rows.map((row) => ({
        id: row.id,
        source: 'acces' as const,
        establishmentId: row.establishmentId,
        serviceId: row.serviceId,
        userID: row.userID,
        userFirstName: row.userFirstName,
        userLastName: row.userLastName,
        action: row.action,
        createdAt: row.createdAt,
        entityType: null,
        entityID: null,
        patientId: row.patientId ?? null,
      }))
    },
  )

  return Promise.resolve()
}

export { accessLogRouter }

import type { FastifyPluginAsync } from 'fastify'

import {
  type PatientAccessLogAdminParams,
  patientAccessLogAdminParamsSchema,
  type PatientAccessLogServiceParams,
  patientAccessLogServiceParamsSchema,
  patientAccessLogsResponseSchema,
} from '../schemas/patientAccessLog.schema'

// Etape 4b, tache 5 : les deux premieres LECTURES du journal des consultations (`PatientAccessLog`,
// tache 1 ; ecrit depuis la tache 2/3). Lire ce journal N'EST PAS consulter un dossier : voir la
// raison declaree dans `EXEMPTED_PATIENT_ROUTES` (utils/access-log-routes.ts) pour la route de
// service ci-dessous.
//
// Route de service : `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`, montee par
// `tenantRoutes` (routes/tenant.routes.ts) au prefixe `/patient/:patientID/acces`. Elle designe
// structurellement un dossier (segment `/patient/` + parametre) au sens de `patientIdParamOf`
// (utils/access-log-routes.ts) : le garde-fou de demarrage l'exige donc dans l'une des deux
// listes declarees la-bas, et elle est dans `EXEMPTED_PATIENT_ROUTES`, pas dans
// `LOGGED_PATIENT_ROUTES` — la journaliser ferait grossir le journal a chaque fois qu'on le
// consulte lui-meme.
const patientAccessLogRouter: FastifyPluginAsync = (fastify) => {
  const { patientAccessLogDomain } = fastify.iocContainer

  fastify.get<{ Params: PatientAccessLogServiceParams }>(
    '/',
    {
      schema: {
        params: patientAccessLogServiceParamsSchema,
        response: { 200: patientAccessLogsResponseSchema },
      },
      config: { permission: 'consultations:read' },
    },
    (request) => patientAccessLogDomain.findByPatientInService(request.params.patientID),
  )

  return Promise.resolve()
}

// Route d'administration d'etablissement : `GET
// /e/:establishmentId/admin/patients/:patientID/acces`, montee par `establishmentAdminRoutes`
// (routes/establishment-admin.routes.ts) au prefixe `/patients/:patientID/acces`. Meme journal,
// a l'echelle de TOUS les services de l'etablissement (`PatientAccessLogRepository.
// findByPatientInEstablishment`, filtre par `establishmentScope()` sous `runAsSystem()`).
//
// PARAMETRE `:patientID`, PAS RENOMME — TOUR DE CORRECTION 1 (revue). Le premier jet renommait
// ce parametre (`:patientRef`) pour sortir des deux filets de `patientIdParamOf`
// (utils/access-log-routes.ts) et echapper ainsi au garde-fou racine
// `assertPatientRouteUnderTenant` (routes/tenant.routes.ts), qui refuse SECHEMENT, au demarrage,
// toute route GET dont l'URL designe un dossier patient sans vivre sous le prefixe de tenant de
// service. DEMONTRE FAUX PAR LA REVUE, avec une sonde reelle
// (`GET /e/:establishmentId/admin/patients/:patientRef/sonde`, servie par un vrai
// `findUniqueOrThrow` sur `Patient`) : le meme renommage rendait un dossier COMPLET (200), sans
// ecrire aucune ligne de journal, et rien — ni le demarrage, ni les 21 suites e2e — ne le
// signalait. Un renommage n'est pas une exemption : il desarme le filet pour TOUTE route future
// qui choisirait ce nom, pas seulement celle-ci.
//
// La route reprend donc `:patientID`, et sa dispense de vivre sous le prefixe de tenant est
// DECLAREE, dans `EXEMPTED_ADMIN_PATIENT_ROUTES` (utils/access-log-routes.ts) — consultee par
// `assertPatientRouteUnderTenant` juste apres son test de prefixe. Une entree la ne promet
// aucune couverture par le crochet d'ecriture (absent hors de `tenantRoutes`) : elle declare
// qu'aucune n'est due, parce que cette route ne lit jamais le dossier lui-meme — elle FILTRE une
// table d'audit par la colonne `patientId` du journal, exactement comme `PatientExportQuery.
// search` filtre l'export sans jamais designer un dossier par un identifiant de route. Elle ne
// rend d'ailleurs aucune identite DE PATIENT ni contenu clinique (voir
// `patientAccessLogsResponseSchema`).
const patientAccessLogAdminRouter: FastifyPluginAsync = (fastify) => {
  const { patientAccessLogDomain } = fastify.iocContainer

  fastify.get<{ Params: PatientAccessLogAdminParams }>(
    '/',
    {
      schema: {
        params: patientAccessLogAdminParamsSchema,
        response: { 200: patientAccessLogsResponseSchema },
      },
      config: { permission: 'access-log:read' },
    },
    (request) => patientAccessLogDomain.findByPatientInEstablishment(request.params.patientID),
  )

  return Promise.resolve()
}

export { patientAccessLogAdminRouter, patientAccessLogRouter }

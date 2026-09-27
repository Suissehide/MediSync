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
      config: { permission: 'accessLog:read' },
    },
    (request) => patientAccessLogDomain.findByPatientInService(request.params.patientID),
  )

  return Promise.resolve()
}

// Route d'administration d'etablissement : `GET
// /e/:establishmentId/admin/patients/:patientRef/acces`, montee par `establishmentAdminRoutes`
// (routes/establishment-admin.routes.ts) au prefixe `/patients/:patientRef/acces`. Meme journal,
// a l'echelle de TOUS les services de l'etablissement (`PatientAccessLogRepository.
// findByPatientInEstablishment`, filtre par `establishmentScope()`).
//
// PARAMETRE NOMME `:patientRef`, PAS `:patientID` (le nom qu'emploie encore le cahier des charges
// de la tache) — DECISION DELIBEREE, PAS UNE COQUILLE, PRISE CONTRE LE CAHIER DES CHARGES APRES
// VERIFICATION PAR EXECUTION. Le garde-fou racine `assertPatientRouteUnderTenant`
// (routes/tenant.routes.ts, pose en hook `onRoute` sur TOUTE l'application, pas seulement sous
// `tenantRoutes`) refuse SECHEMENT, au demarrage, toute route GET dont l'URL designe un dossier
// patient — au sens de `patientIdParamOf`, utils/access-log-routes.ts — sans vivre sous le
// prefixe de tenant de service, SANS CONSULTER AUCUNE LISTE D'EXEMPTION : c'est volontaire (son
// propre commentaire : « la seule reponse juste est de remettre cette route sous le prefixe de
// tenant »), parce qu'une route hors de ce prefixe n'herite jamais du crochet d'ecriture — une
// exemption y mentirait sur une couverture qui n'existe pas.
//
// Le filet SECONDAIRE de `patientIdParamOf` reconnait un parametre nomme `patientId`/`patientID`
// (la casse indifferente) QUEL QUE SOIT LE NOM DU SEGMENT qui le porte, justement pour attraper
// une route comme celle-ci, posee sous `patients/` (pluriel) et non `patient/` (singulier) — le
// filet PRIMAIRE, structurel, ne la voit pas, mais le secondaire si. Enregistrer cette route
// avec `:patientID` (essaye en premier, pour suivre le cahier des charges a la lettre) fait donc
// echouer `app.ready()` avec « hors du greffon de tenant » : une route d'administration
// d'etablissement ne vit, par definition, jamais sous `/e/:establishmentId/s/:serviceId`.
//
// Cette route n'est pourtant pas une lecture de dossier au sens que ce garde-fou protege : elle
// ne rend aucune identite ni contenu clinique (voir `patientAccessLogsResponseSchema`), et son
// parametre ne fait que FILTRER une table d'audit par la colonne `patientId` du journal —
// exactement comme `PatientExportQuery.search` (utils/access-log-routes.ts) filtre l'export sans
// jamais designer un dossier par un identifiant de route. Renommer le parametre en `:patientRef`
// sort la route des DEUX filets (le segment est deja hors du premier ; `patientRef` ne matche pas
// la regex du second) sans rien changer a ce que la route fait ou renvoie.
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
    (request) => patientAccessLogDomain.findByPatientInEstablishment(request.params.patientRef),
  )

  return Promise.resolve()
}

export { patientAccessLogAdminRouter, patientAccessLogRouter }

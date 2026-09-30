import { z } from 'zod/v4'

// Les deux premieres LECTURES du journal
// des consultations. Le schema de reponse porte l'auteur, l'action, la date, le service, ET
// `accesParOctroi` — jamais `patientId`, `exportCount` ni `exportFilters`, meme si le depot les
// rend (voir `PatientAccessLogRepository.findByPatientInService`/`findByPatientInEstablishment`).
// Un objet Zod, PAR DEFAUT, retire au parsing toute cle absente de sa forme (mode « strip ») :
// c'est ce comportement par defaut, et non une liste noire ecrite a la main, qui empeche tout
// contenu clinique ou toute donnee d'identite de fuiter par cette route — exactement comme
// `enrollmentIssueResponseSchema` le fait deja pour une autre lecture de ce meme greffon.
//
// `accesParOctroi` est INCLUS dans la reponse, deliberement : c'est un booleen sur la
// PROVENANCE de l'acces (distinguer un acces de depannage — octroi temporaire de super-admin —
// d'un acces de soin ordinaire), l'information la plus pertinente d'un journal d'audit apres
// l'auteur lui-meme. Ce n'est ni un contenu clinique, ni une identite. `patientId`/`exportCount`/
// `exportFilters` restent exclus, pour les raisons deja donnees ailleurs (identite de patient,
// contenu potentiellement clinique) — ce champ-ci n'a jamais porte l'une ou l'autre de ces
// raisons.
export const patientAccessLogEntryResponseSchema = z.object({
  id: z.cuid(),
  action: z.string(),
  createdAt: z.coerce.date(),
  serviceId: z.string(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  accesParOctroi: z.boolean(),
})

export const patientAccessLogsResponseSchema = z.array(
  patientAccessLogEntryResponseSchema,
)

// Route de service : `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. Meme nom
// de parametre que `enrollmentIssuePatientParamsSchema`/`patientServiceFileRouter` (`:patientID`,
// casse haute) : cette route vit sous le segment `/patient/`, donc le garde-fou de demarrage
// (`assertPatientReadLogged`, `EXEMPTED_PATIENT_ROUTES`) l'exige et l'attend sous ce nom — voir
// utils/access-log-routes.ts.
export const patientAccessLogServiceParamsSchema = z.object({
  patientID: z.cuid(),
})

export type PatientAccessLogServiceParams = z.infer<
  typeof patientAccessLogServiceParamsSchema
>

// Route d'administration d'etablissement : `GET /e/:establishmentId/admin/patients/:patientID/acces`.
// Meme nom de parametre que la route de service (`:patientID`) — un renommage avait ete essaye
// pour echapper au garde-fou racine `assertPatientRouteUnderTenant`, demontre inadequat et
// abandonne : la route est desormais declaree, avec sa raison, dans
// `EXEMPTED_ADMIN_PATIENT_ROUTES` (utils/access-log-routes.ts) — voir le commentaire dans
// interfaces/http/fastify/routes/patientAccessLog.ts pour le detail.
export const patientAccessLogAdminParamsSchema = z.object({
  patientID: z.cuid(),
})

export type PatientAccessLogAdminParams = z.infer<
  typeof patientAccessLogAdminParamsSchema
>

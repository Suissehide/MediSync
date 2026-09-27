import { z } from 'zod/v4'

// Etape 4b, tache 5 : les deux premieres LECTURES du journal des consultations. Le schema de
// reponse ne porte QUE l'auteur, l'action, la date et le service (cahier des charges de la
// tache) — jamais `patientId`, `exportCount`, `exportFilters` ni `accesParOctroi`, meme si le
// depot les rend (voir `PatientAccessLogRepository.findByPatientInService`/
// `findByPatientInEstablishment`). Un objet Zod, PAR DEFAUT, retire au parsing toute cle absente
// de sa forme (mode « strip ») : c'est ce comportement par defaut, et non une liste noire
// ecrite a la main, qui empeche tout contenu clinique ou toute donnee d'audit superflue de
// fuiter par cette route — exactement comme `enrollmentIssueResponseSchema` le fait deja pour
// une autre lecture de ce meme greffon.
export const patientAccessLogEntryResponseSchema = z.object({
  id: z.cuid(),
  action: z.string(),
  createdAt: z.coerce.date(),
  serviceId: z.string(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
})

export const patientAccessLogsResponseSchema = z.array(patientAccessLogEntryResponseSchema)

// Route de service : `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. Meme nom
// de parametre que `enrollmentIssuePatientParamsSchema`/`patientServiceFileRouter` (`:patientID`,
// casse haute) : cette route vit sous le segment `/patient/`, donc le garde-fou de demarrage
// (`assertPatientReadLogged`, `EXEMPTED_PATIENT_ROUTES`) l'exige et l'attend sous ce nom — voir
// utils/access-log-routes.ts.
export const patientAccessLogServiceParamsSchema = z.object({
  patientID: z.cuid(),
})

export type PatientAccessLogServiceParams = z.infer<typeof patientAccessLogServiceParamsSchema>

// Route d'administration d'etablissement : `GET /e/:establishmentId/admin/patients/:patientRef/acces`.
// Parametre nomme `:patientRef`, PAS `:patientID` NI `:patientId` — decision deliberee, voir le
// commentaire dans interfaces/http/fastify/routes/patientAccessLog.ts (le garde-fou racine
// `assertPatientRouteUnderTenant` refuse au demarrage toute route dont l'URL porte un parametre
// nomme ainsi, quel que soit le nom de son segment, si elle ne vit pas sous le prefixe de tenant
// de service — verifie par execution).
export const patientAccessLogAdminParamsSchema = z.object({
  patientRef: z.cuid(),
})

export type PatientAccessLogAdminParams = z.infer<typeof patientAccessLogAdminParamsSchema>

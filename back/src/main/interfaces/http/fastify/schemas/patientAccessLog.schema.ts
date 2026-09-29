import { z } from 'zod/v4'

// Etape 4b, tache 5 (tour de correction 1, tache 10) : les deux premieres LECTURES du journal
// des consultations. Le schema de reponse porte l'auteur, l'action, la date, le service, ET
// `accesParOctroi` — jamais `patientId`, `exportCount` ni `exportFilters`, meme si le depot les
// rend (voir `PatientAccessLogRepository.findByPatientInService`/`findByPatientInEstablishment`).
// Un objet Zod, PAR DEFAUT, retire au parsing toute cle absente de sa forme (mode « strip ») :
// c'est ce comportement par defaut, et non une liste noire ecrite a la main, qui empeche tout
// contenu clinique ou toute donnee d'identite de fuiter par cette route — exactement comme
// `enrollmentIssueResponseSchema` le fait deja pour une autre lecture de ce meme greffon.
//
// `accesParOctroi` N'EST PLUS DANS LA LISTE DES CHAMPS EXCLUS. La premiere version de ce schema
// (tache 5) l'excluait, parce que le cahier des charges de CETTE tache-la enumerait les champs a
// rendre (« l'auteur, l'action, la date, le service ») sans le nommer — l'implementeur de la
// tache 5 a suivi cette liste a la lettre, et a eu raison de le faire. Le defaut n'etait pas dans
// le code, il etait dans le cahier des charges : `accesParOctroi` a ete ajoutee (tache 2) pour
// distinguer un acces de depannage (octroi temporaire de super-admin) d'un acces de soin
// ordinaire, et une colonne ecrite sur chaque ligne mais lue par personne est precisement la
// classe de defaut que cette etape existe pour fermer. Ce n'est ni un contenu clinique, ni une
// identite : c'est un booleen sur la PROVENANCE de l'acces, l'information la plus pertinente
// d'un journal d'audit apres l'auteur lui-meme. `patientId`/`exportCount`/`exportFilters`
// restent exclus, pour les raisons deja donnees ailleurs (identite de patient, contenu
// potentiellement clinique) — ce champ-ci n'a jamais porte l'une ou l'autre de ces raisons.
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
// pour echapper au garde-fou racine `assertPatientRouteUnderTenant`, demontre faux par la revue
// (tour de correction 1) et abandonne : la route est desormais declaree, avec sa raison, dans
// `EXEMPTED_ADMIN_PATIENT_ROUTES` (utils/access-log-routes.ts) — voir le commentaire dans
// interfaces/http/fastify/routes/patientAccessLog.ts pour le detail.
export const patientAccessLogAdminParamsSchema = z.object({
  patientID: z.cuid(),
})

export type PatientAccessLogAdminParams = z.infer<
  typeof patientAccessLogAdminParamsSchema
>

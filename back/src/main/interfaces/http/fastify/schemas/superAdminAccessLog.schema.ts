import { z } from 'zod/v4'

// `GET /super-admin/access-log` (spec, tache 6, etape 4b) : ferme deux trous laisses par
// l'etape precedente -- voir routes/super-admin/access-log.ts pour le detail. `source` choisit
// LEQUEL des deux journaux lire (jamais les deux a la fois : leurs colonnes ne se recouvrent
// qu'en partie, et un merge silencieux masquerait plus qu'il n'eclairerait un ecran de
// diagnostic plateforme) :
//   - `activite` -> `ActivityLog`, deja declare dans SUPERADMIN_OPERATIONS (tache 1) ;
//   - `acces`    -> `PatientAccessLog`, declare a cette tache (tenant-guard.ts).
export const superAdminAccessLogSourceSchema = z.enum(['activite', 'acces'])

// Trois filtres, tous optionnels : `establishmentId` (etablissement), `userID` (compte -- meme
// nom de colonne dans les deux modeles), `action` (chaine libre dans les deux modeles). Sans
// aucun filtre, la lecture rend TOUTE la table du journal choisi -- y compris les lignes du
// script d'amorcage (`ActivityLog.establishmentId: null`), qu'aucune autre route ne peut lire.
export const superAdminAccessLogQuerySchema = z.object({
  source: superAdminAccessLogSourceSchema,
  establishmentId: z.string().optional(),
  userID: z.string().optional(),
  action: z.string().optional(),
})

// Forme UNIQUE pour les deux sources (plutot qu'une union discriminee) : les champs propres a
// une source et absents de l'autre (`entityType`/`entityID` pour `activite`, `patientId` pour
// `acces`) sont simplement `null` quand la ligne vient de l'autre journal. C'est la route qui
// construit ce DTO champ par champ (jamais un `...row` etale) : AUCUNE colonne de
// `PatientAccessLog` hors de cette liste ne peut donc fuiter par accident -- en particulier
// `exportFilters` (texte libre, le seul champ de la table qui pourrait porter du contenu
// clinique, voir domain/patientAccessLog.domain.ts) et `accesParOctroi` ne sont jamais lus par
// cette route.
//
// `patientId` est un IDENTIFIANT, jamais un nom : cette route ne rouvre PAS « le super-admin
// compte les patients, il ne les lit pas » (SUPERADMIN_OPERATIONS, tenant-guard.ts) -- elle ne
// rend jamais `Patient.firstName`/`lastName`, seulement la cle etrangere du journal d'audit,
// exactement comme `entityID` peut deja porter un identifiant de patient sur le journal
// d'activite (voir establishment.repository.ts#activityLogFor) sans jamais en reveler le nom.
export const superAdminAccessLogEntryResponseSchema = z.object({
  id: z.string(),
  source: superAdminAccessLogSourceSchema,
  establishmentId: z.string().nullable(),
  serviceId: z.string().nullable(),
  userID: z.string(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  action: z.string(),
  createdAt: z.coerce.date(),
  entityType: z.string().nullable(),
  entityID: z.string().nullable(),
  patientId: z.string().nullable(),
})

export const superAdminAccessLogsResponseSchema = z.array(superAdminAccessLogEntryResponseSchema)

export type SuperAdminAccessLogQuery = z.infer<typeof superAdminAccessLogQuerySchema>
export type SuperAdminAccessLogEntry = z.infer<typeof superAdminAccessLogEntryResponseSchema>

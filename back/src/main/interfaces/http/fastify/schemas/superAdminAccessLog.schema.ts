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
// une source et absents de l'autre (`entityType`/`entityID` pour `activite`, `patientId` ET
// `accesParOctroi` pour `acces` -- `ActivityLog` n'a pas cette notion) sont simplement `null`
// quand la ligne vient de l'autre journal. C'est la route qui construit ce DTO champ par champ
// (jamais un `...row` etale) : AUCUNE colonne de `PatientAccessLog` hors de cette liste ne peut
// donc fuiter par accident -- en particulier `exportFilters` (texte libre, le seul champ de la
// table qui pourrait porter du contenu clinique, voir domain/patientAccessLog.domain.ts) n'est
// jamais lu par cette route.
//
// `accesParOctroi` N'EST PLUS DANS LA LISTE DES CHAMPS EXCLUS (tour de correction 1, tache 10) --
// voir le commentaire equivalent dans `patientAccessLog.schema.ts` pour la raison complete (un
// defaut de cahier des charges a la tache 5, pas un choix delibere de securite). Un booleen sur
// la PROVENANCE de l'acces n'a jamais porte de contenu clinique ni d'identite ; `null` sur les
// lignes `activite` (le seul cas ou cette notion n'existe pas), jamais `false` -- `false`
// affirmerait a tort un acces reel la ou aucun octroi n'existe meme conceptuellement.
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
  accesParOctroi: z.boolean().nullable(),
})

export const superAdminAccessLogsResponseSchema = z.array(superAdminAccessLogEntryResponseSchema)

export type SuperAdminAccessLogQuery = z.infer<typeof superAdminAccessLogQuerySchema>
export type SuperAdminAccessLogEntry = z.infer<typeof superAdminAccessLogEntryResponseSchema>

import { z } from 'zod/v4'

// `GET /super-admin/access-log` (spec, tache 6, etape 4b) : ferme deux trous laisses par
// l'etape precedente -- voir routes/super-admin/access-log.ts pour le detail. `source` choisit
// LEQUEL des deux journaux lire (jamais les deux a la fois : leurs colonnes ne se recouvrent
// qu'en partie, et un merge silencieux masquerait plus qu'il n'eclairerait un ecran de
// diagnostic plateforme) :
//   - `activite` -> `ActivityLog`, deja declare dans SUPERADMIN_OPERATIONS (tache 1) ;
//   - `acces`    -> `PatientAccessLog`, declare a cette tache (tenant-guard.ts).
export const superAdminAccessLogSourceSchema = z.enum(['activite', 'acces'])

// Valeur RESERVEE du filtre d'etablissement : « les lignes qui n'ont AUCUN etablissement ».
//
// REVUE FINALE DE BRANCHE, Important n°1 — POURQUOI ELLE EXISTE, ET CE QUI A CHANGE DEPUIS. La
// lecture plateforme etait bornee a `PLATFORM_ACCESS_LOG_LIMIT` lignes (200, `createdAt desc`, les
// deux depots) ; elle est PAGINEE depuis le 2026-10-01, donc les lignes visees ci-dessous sont
// desormais atteignables autrement. CETTE VALEUR RESERVEE RESTE, et ce n'est pas par inertie : un
// filtre qui les vise directement est plus court que de paginer jusqu'aux plus anciennes lignes de
// toute la plateforme, et c'est encore ce que propose la liste deroulante de l'ecran. Les
// lignes du script d'amorcage (`UserDomain.bootstrapSuperAdmin`, `establishmentId: null`) sont
// par construction LES PLUS ANCIENNES de la table : des que le journal d'activite depasse 200
// entrees, elles tombent hors de la page, et AUCUN filtre ne permettait de les viser -- le
// filtre d'etablissement ne savait pas demander « sans etablissement », et la liste deroulante
// du front ne propose que des etablissements REELS. La documentation presentait pourtant cette
// lisibilite comme ACQUISE (« l'un des deux trous que cet ecran ferme ») : elle ne l'etait que
// sur un journal jeune. C'est cette borne-la, pas cette valeur reservee, que la pagination a
// supprimee.
//
// UNE VALEUR RESERVEE PLUTOT QU'UN SECOND CHAMP : un `sansEtablissement` a cote
// d'`establishmentId` rendrait representable une demande contradictoire (« l'etablissement A, et
// sans etablissement »), qu'il faudrait ensuite arbitrer quelque part. Un seul champ, trois
// etats (absent / un identifiant / cette valeur) ne le permet pas. La collision est impossible :
// les identifiants d'etablissement sont des cuid (`z.cuid()`, schemas/index.ts), jamais ce mot.
export const SANS_ETABLISSEMENT = 'aucun'

// Trois filtres, tous optionnels : `establishmentId` (etablissement, ou `SANS_ETABLISSEMENT`),
// `compte`, `action` (chaine libre dans les deux modeles). Sans aucun filtre, la lecture rend la
// page demandee du journal choisi, `createdAt desc`, et son total (voir `page`/`pageSize`
// ci-dessous) -- avant le 2026-10-01 elle rendait les 200 dernieres lignes, et rien d'autre.
//
// `compte` REMPLACE `userID` (revue finale de branche, Important n°1). L'ancien filtre exigeait
// un identifiant EXACT ; l'ecran, lui, offre une recherche par NOM, qu'il appliquait cote
// navigateur -- donc sur la page DEJA TRONQUEE a 200 lignes. Chercher un compte rendait « aucune
// entree » alors que ses lignes existaient, quelques milliers de lignes plus bas. Ce filtre-ci
// est evalue EN BASE, sur toute la table, et accepte les deux formes que l'ecran peut produire :
// l'identifiant exact (`userID`, ce que faisait l'ancien filtre -- rien n'est perdu) ou un
// fragment de prenom/nom, insensible a la casse. Les noms sont les copies DENORMALISEES portees
// par chaque ligne de journal (`userFirstName`/`userLastName`), jamais une jointure vers `User` :
// un journal d'audit doit dire qui a agi SOUS LE NOM QU'IL PORTAIT ALORS.
//
// CE QU'IL NE FAIT PAS, dit plutot que suppose : il ne rapproche pas prenom ET nom d'une meme
// saisie (« Ada DuServiceA » ne matche pas, « Ada » et « DuServiceA » matchent). L'ancien filtre
// navigateur, lui, concatenait les deux. C'est la seule capacite perdue au change, et elle est
// perdue contre celle de voir les lignes au-dela de la 200e.
export const superAdminAccessLogQuerySchema = z
  .object({
    source: superAdminAccessLogSourceSchema,
    establishmentId: z.string().optional(),
    compte: z.string().optional(),
    action: z.string().optional(),
    // PAGINATION (2026-10-01) : memes bornes, memes noms et meme defaut que le journal de
    // l'administration d'etablissement (`getActivityLogsQuerySchema`, activityLog.schema.ts) --
    // cet ecran-ci n'a aucune raison de se paginer autrement que son voisin. `max(100)` borne la
    // requete : sans plafond, `pageSize=100000` referait exactement la lecture non bornee que
    // cette pagination remplace.
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  // `PatientAccessLog.establishmentId` est NON NULLABLE (prisma/schema.prisma) : une ligne de
  // consultation sans etablissement n'existe pas, et ne peut pas exister. Demander
  // `source=acces&establishmentId=aucun` n'est donc pas une recherche vide, c'est une question
  // qui n'a pas de sens -- un 400 le dit, la, ou une liste vide laisserait croire « aucune
  // aujourd'hui, peut-etre demain ».
  .refine(
    (q) => !(q.source === 'acces' && q.establishmentId === SANS_ETABLISSEMENT),
    {
      path: ['establishmentId'],
      message:
        `establishmentId=${SANS_ETABLISSEMENT} n'a de sens que sur source=activite : ` +
        'PatientAccessLog.establishmentId est non nullable, aucune ligne de consultation ne ' +
        'peut etre sans etablissement.',
    },
  )

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

// ENVELOPPE PAGINEE (2026-10-01), et non plus un tableau nu : memes quatre cles, dans le meme
// ordre, que `activityLogsResponseSchema` (activityLog.schema.ts). `total` est le decompte du
// perimetre demande HORS page -- c'est la seule valeur qui rende la derniere page atteignable, et
// c'est elle qui manquait quand la lecture etait tronquee a 200 lignes : rien, dans une reponse de
// 200 lignes, ne disait s'il y en avait 200 ou 200 000.
export const superAdminAccessLogsResponseSchema = z.object({
  data: z.array(superAdminAccessLogEntryResponseSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type SuperAdminAccessLogQuery = z.infer<
  typeof superAdminAccessLogQuerySchema
>
export type SuperAdminAccessLogEntry = z.infer<
  typeof superAdminAccessLogEntryResponseSchema
>
export type SuperAdminAccessLogPage = z.infer<
  typeof superAdminAccessLogsResponseSchema
>

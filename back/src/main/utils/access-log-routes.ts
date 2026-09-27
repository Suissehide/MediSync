import type { AccessAction } from '../types/domain/patientAccessLog.domain.interface'

// CE QUI DESIGNE UN DOSSIER IDENTIFIE : LA STRUCTURE DE L'URL, PAS LE NOM DU PARAMETRE.
//
// La premiere version de ce fichier reconnaissait un dossier au NOM du parametre (`:patientID`,
// puis `:patientId` pour les routes de diagnostic, la casse en moins). C'etait deja un cran
// au-dessus d'une comparaison litterale, et ca ne suffisait pas : une detection par nom, meme
// tolerante, ne peut PAS porter une promesse de couverture par defaut. Montre par execution (tour
// de correction 1) — la route reelle `GET /patient/:patient_id/sonde-revue`, ajoutee dans le vrai
// routeur patient, demarrait sans broncher, servait un dossier identifie, n'ecrivait aucune ligne,
// et rien nulle part ne le signalait. Idem avec `:id`, idem avec `:pid`. Ce depot a DEJA prouve que
// le nom derive (`:patientID` chez les uns, `:patientId` chez `diagnosticEducatifRouter`) ; il
// derivera encore, et la prochaine derive aurait ete silencieuse.
//
// La regle qui porte la promesse est donc STRUCTURELLE : un segment `/patient/` suivi d'un
// parametre, QUEL QU'EN SOIT LE NOM. Verifie sans faux positif sur l'arbre reel — `/patient`,
// `/patient/export`, `/patient/search` et `/patient/with-tags` n'ont pas de parametre en position
// suivante et restent dehors ; les sept routes couvertes le restent ; `:patient_id`, `:id`, `:pid`
// tombent dans le filet.
const PATIENT_SEGMENT_RE = /(?:^|\/)patient\/:([A-Za-z0-9_]+)(?=\/|$)/

// Filet SECONDAIRE, conserve en plus du precedent et jamais a sa place : un parametre nomme
// `patientID`/`patientId` (la casse est indifferente) porte par une URL qui ne passe pas par un
// segment `/patient/` — par exemple `/dossier/:patientID`. Il n'a aucune promesse a tenir tout
// seul ; il elargit le filet structurel, sans jamais le remplacer.
const PATIENT_PARAM_RE = /:(patientId)(?![A-Za-z0-9_])/i

// Rend le nom EXACT du parametre qui designe le dossier, ou `null`. Un seul endroit sait ce que
// « cette route designe un dossier identifie » veut dire : le garde-fou de demarrage, le refus
// racine et le crochet d'ecriture s'en servent tous les trois, donc ils ne peuvent pas diverger —
// et le crochet lit `request.params` sous le nom rendu ici plutot que de le deviner.
//
// RESIDU, dit plutot que tu : une route qui designerait un dossier sous un AUTRE nom de segment
// ET un autre nom de parametre (`/dossier/:id`) echappe encore aux deux filets. La forme de l'URL
// est la seule chose qu'un crochet `onRoute` puisse examiner ; aucune regle syntaxique ne peut
// deviner qu'un segment inedit designe un patient.
export const patientIdParamOf = (url: string): string | null =>
  PATIENT_SEGMENT_RE.exec(url)?.[1] ?? PATIENT_PARAM_RE.exec(url)?.[1] ?? null

// Les routes de lecture qui designent un dossier identifie. Toute route GET dont l'URL designe un
// dossier — au sens de `patientIdParamOf` ci-dessus — doit figurer dans l'une des deux listes, ou
// le serveur refuse de demarrer (voir `assertPatientReadLogged`,
// interfaces/http/fastify/plugins/tenant.plugin.ts). Les deux listes sont comparees aux routes
// REELLES, dans les deux sens : une entree morte fait echouer le demarrage elle aussi
// (`assertNoDeadPatientAccessEntry`, crochet `onReady` pose par routes/tenant.routes.ts).
//
// PORTEE EXACTE. Ces deux crochets sont poses par `tenantRoutes` (routes/tenant.routes.ts), au
// meme endroit que le crochet d'ecriture `recordPatientAccess` : ils voient donc exactement les
// memes routes, et une entree de `LOGGED_PATIENT_ROUTES` est toujours reellement journalisee,
// jamais promise en l'air. Ce qui vit HORS de ce greffon n'est pas laisse de cote pour autant —
// et surtout, contrairement a ce que ce commentaire affirmait au premier jet, ce n'est PAS « la
// meme limite qu'`assertTenantShapedRoute` » : ce dernier est pose A LA RACINE precisement pour ne
// pas l'avoir (« la forme de l'URL suffit a exiger la declaration, ou que la route soit posee »),
// et `assertSuperAdminShapedRoute` de meme. Le troisieme garde-fou a donc lui aussi son frere
// racine : `assertPatientRouteUnderTenant` (routes/tenant.routes.ts) refuse SECHEMENT, sans
// consulter aucune liste, toute route GET de forme patient enregistree hors du prefixe de tenant —
// la seule chose que ces listes ne pourraient pas promettre pour elle, c'est d'etre journalisee.
//
// Seules les lectures (GET) sont concernees. Les ecritures (POST/PATCH/PUT/DELETE) sont deja
// tracees par `ActivityLog` (services/activity-log.subscriber.ts) : ce journal-ci existe pour la
// CONSULTATION, qui ne laisse autrement aucune trace.
export const LOGGED_PATIENT_ROUTES: Record<string, AccessAction> = {
  '/e/:establishmentId/s/:serviceId/patient/:patientID': 'dossier.ouvert',
  '/e/:establishmentId/s/:serviceId/patient/:patientID/service-file':
    'sousDossier.ouvert',
  // ECART ASSUME par rapport a la liste du cahier des charges, qui ne connaissait pas ces deux
  // routes (voir le rapport de tache). Elles rendent le contenu clinique d'un patient nomme
  // (permission `clinical:read`, `diagnosticEducatifRouter`) ; l'onglet « diagnostic » du dossier
  // n'est monte que lorsqu'on le choisit, donc c'est un acte de consultation DISTINCT de
  // l'ouverture du dossier, pas un doublon comme `/pathways`.
  '/e/:establishmentId/s/:serviceId/patient/:patientId/diagnostic':
    'sousDossier.ouvert',
  '/e/:establishmentId/s/:serviceId/patient/:patientId/diagnostic/:diagnosticId':
    'sousDossier.ouvert',
  // ARBITRAGE DE LEO (tour de correction 1), qui RENVERSE le premier jet : cette route est
  // JOURNALISEE, et c'est une quatrieme valeur d'`AccessAction` qui la decrit, pas une etiquette
  // approximative empruntee aux trois autres.
  //
  // Le premier jet l'exemptait, en s'appuyant sur deux faits que la revue a montres FAUX :
  // `enrollmentIssueResponseSchema` (schemas/enrollmentIssue.schema.ts) porte bel et bien
  // `patientId`, donc la reponse designe nommement un dossier ; et `reason` est une chaine LIBRE,
  // que rien dans le schema ni dans le modele Prisma ne borne a un « motif technique » — rien
  // n'empeche qu'un motif de refus d'inscription a un parcours de soin en dise long sur le
  // patient. Le refus d'une etiquette approximative etait juste ; la conclusion qu'on en tirait
  // (exempter) ne l'etait pas.
  '/e/:establishmentId/s/:serviceId/patient/:patientID/enrollment-issue':
    'echecsInscription.consultes',
}

// Chaque exemption porte sa raison en clair. Une exemption se justifie POSITIVEMENT : le defaut
// est de journaliser.
//
// La tache 5 ajoutera `/e/:establishmentId/s/:serviceId/patient/:patientID/acces` — la route qui
// LIT le journal. Elle designera elle-meme un dossier et devra donc venir ici, avec pour raison
// que lire le journal des consultations d'un dossier n'est pas consulter ce dossier : elle ne rend
// aucune identite ni aucun contenu clinique, seulement la liste de qui a ouvert quoi et quand. La
// journaliser ferait de plus grossir le journal a chaque fois qu'on le consulte, jusqu'a noyer les
// acces de soin sous les acces d'audit. Elle n'est PAS inscrite ici aujourd'hui : une entree morte
// fait echouer le demarrage (voir plus haut), donc elle s'ajoutera avec la route, pas avant.
export const EXEMPTED_PATIENT_ROUTES: Record<string, string> = {
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathways':
    "appelee par l'ecran du dossier en meme temps que l'ouverture : la journaliser doublerait chaque ligne sans rien apprendre",
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathway/:pathwayID/appointments-count':
    'rend un nombre, aucune identite, aucun contenu',
}

// Ce qu'il y a a journaliser pour une route donnee, ou `null` s'il n'y a rien. Ecrit ici plutot
// que dans le crochet : la connaissance des listes, du nom du parametre et de la facon d'en
// tirer l'identifiant tient en un seul endroit — et le crochet (interfaces/http/fastify/plugins/
// tenant.plugin.ts) reste assez court pour se lire d'un trait, ce que le lint impose de toute
// facon (`noExcessiveCognitiveComplexity`).
//
// `url` est l'URL DECLAREE de la route (`request.routeOptions.url`), avec ses `:parametres` :
// exactement la chaine que `assertPatientReadLogged` a vue au demarrage. `undefined` quand
// aucune route n'a matche (404 du routeur).
export const plannedPatientAccess = (
  url: string | undefined,
  params: Record<string, string | undefined>,
): { action: AccessAction; patientId: string } | null => {
  if (url === undefined) {
    return null
  }
  const action = LOGGED_PATIENT_ROUTES[url]
  if (action === undefined) {
    return null
  }
  const paramName = patientIdParamOf(url)
  const patientId = paramName === null ? undefined : params[paramName]
  if (typeof patientId !== 'string' || patientId === '') {
    return null
  }
  return { action, patientId }
}

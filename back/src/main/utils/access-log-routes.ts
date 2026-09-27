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
export const EXEMPTED_PATIENT_ROUTES: Record<string, string> = {
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathways':
    "appelee par l'ecran du dossier en meme temps que l'ouverture : la journaliser doublerait chaque ligne sans rien apprendre",
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathway/:pathwayID/appointments-count':
    'rend un nombre, aucune identite, aucun contenu',
  // Tache 5 (etape 4b) : la route qui LIT le journal, cote service
  // (interfaces/http/fastify/routes/patientAccessLog.ts). Lire le journal des consultations
  // d'un dossier n'est pas consulter ce dossier : elle ne rend aucune identite ni aucun contenu
  // clinique (voir `patientAccessLogsResponseSchema`, schemas/patientAccessLog.schema.ts —
  // CINQ champs : l'auteur, l'action, la date, le service et `accesParOctroi`), seulement la
  // liste de qui a ouvert quoi, quand, et par quelle provenance. La journaliser ferait de plus
  // grossir le journal a chaque fois qu'on le consulte, jusqu'a noyer les acces de soin sous
  // les acces d'audit.
  // REVUE FINALE DE BRANCHE : cette enumeration disait encore « uniquement l'auteur, l'action,
  // la date et le service », la liste du cahier des charges de la tache 5 — periMEE depuis que
  // la tache 10 a expose `accesParOctroi`. C'est la MEME phrase, au mot pres, qui avait rendu ce
  // champ invisible cinq taches durant : une enumeration recopiee d'un brief, laissee derriere
  // le code qu'elle est censee decrire. Une raison d'exemption qui enumere doit etre relue
  // chaque fois que le schema cite change, ou ne pas enumerer du tout.
  // Tour de correction 1 (revue) : le premier jet disait « aucune identite », un absolu faux —
  // la reponse porte le nom de l'AGENT (auteur de l'acces), une identite reelle. Ce qu'elle ne
  // porte jamais, c'est l'identite ou le contenu clinique DU PATIENT (voir
  // `patientAccessLogsResponseSchema` : `userFirstName`/`userLastName` y sont l'auteur, jamais
  // le patient, qui n'apparait que par l'URL deja connue de l'appelant).
  '/e/:establishmentId/s/:serviceId/patient/:patientID/acces':
    "lit le journal des consultations d'un dossier, n'en constitue pas une : aucune identite DE PATIENT ni contenu clinique rendus (l'auteur de l'acces, oui) — et la journaliser ferait grossir le journal a chaque consultation de lui-meme",
}

// Deuxieme liste d'exemption, pour le SECOND garde-fou racine (`assertPatientRouteUnderTenant`,
// routes/tenant.routes.ts), pas pour `assertPatientReadLogged` ni pour la liste ci-dessus.
//
// PORTEE, ET DIFFERENCE AVEC `EXEMPTED_PATIENT_ROUTES` : une entree ci-dessus exempte une route
// de la JOURNALISATION — elle promet implicitement qu'une couverture PAR LE CROCHET D'ECRITURE
// existe (la route vit sous `tenantRoutes`, donc herite de `recordPatientAccess`), et choisit
// simplement de ne pas s'en servir. Une entree ICI exempte une route de l'OBLIGATION DE VIVRE
// SOUS LE PREFIXE DE TENANT — elle ne promet AUCUNE couverture par ce crochet (absent hors de
// `tenantRoutes`), elle declare qu'il n'en faut aucune, parce que la route ne lit jamais le
// dossier lui-meme : elle FILTRE une table d'audit par un identifiant de patient, sans jamais
// rendre son contenu.
//
// TOUR DE CORRECTION 1 (revue, tache 5) — CE QUE CETTE LISTE REMPLACE, ET POURQUOI CE N'ETAIT
// PAS UN DETAIL. Le premier jet renommait le parametre de la route d'administration
// (`:patientID` -> `:patientRef`) pour sortir des deux filets de `patientIdParamOf` et
// echapper ainsi a `assertPatientRouteUnderTenant`. Demontre FAUX par la revue, avec une sonde
// reelle : `GET /e/:establishmentId/admin/patients/:patientRef/sonde`, servie par un vrai
// `findUniqueOrThrow` sur `Patient`, rendait un dossier COMPLET (200), sans ecrire aucune ligne
// de journal, et rien — ni le demarrage, ni les 21 suites e2e — ne le signalait. Le
// contrefactuel etait sans appel : meme code, seul le nom du parametre change, et le serveur
// refuse de demarrer en nommant la route. Un renommage n'est donc pas une exemption : il ne
// declare rien, il rend le filet aveugle pour TOUTE future route qui choisirait ce nom, pas
// seulement celle-ci. Cette liste-ci, elle, ne desarme rien : `patientIdParamOf` continue de
// reconnaitre `:patientID` normalement, et seule l'URL EXACTE declaree ci-dessous echappe au
// refus — une route non declaree de la meme forme (`/admin/patients/:xxx/...`) reste refusee
// (voir le test `refuse toujours une route non declaree de la meme forme`,
// access-log-hook.test.ts).
//
// GARDE DE L'EXEMPTION ELLE-MEME, SYMETRIQUE DE `assertNoDeadPatientAccessEntry` : une entree
// qui ne correspond plus a aucune route GET reelle fait echouer le demarrage —
// `assertNoDeadAdminPatientExemption` (routes/tenant.routes.ts), posee en `onReady` a la racine
// (routes/index.ts), avec les routes REELLEMENT vues par son crochet `onRoute`, jamais une liste
// recopiee.
export const EXEMPTED_ADMIN_PATIENT_ROUTES: Record<string, string> = {
  '/e/:establishmentId/admin/patients/:patientID/acces':
    "filtre le journal des consultations par l'identifiant de patient de l'URL, ne lit jamais le dossier lui-meme : aucune identite DE PATIENT ni contenu clinique rendus (voir patientAccessLogsResponseSchema)",
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

// ---------------------------------------------------------------------------
// L'export (tache 4, etape 4b) : structurellement hors du filet ci-dessus.
// ---------------------------------------------------------------------------
//
// `GET /patient/export` n'a AUCUN parametre dans son URL : `patientIdParamOf` y rend `null`,
// donc `assertPatientReadLogged` ne l'exige dans aucune des deux listes ci-dessus, et
// `plannedPatientAccess` n'a rien a y lire. C'est voulu, pas un trou -- c'est exactement la
// raison d'etre de cette tache. Un dispositif dedie, symetrique de celui-ci mais construit
// depuis la chaine de requete plutot que depuis un parametre de route, journalise cette route
// EN UNE SEULE LIGNE (le nombre de dossiers rendus, pas un par dossier -- une ligne par
// patient reproduirait exactement le defaut qui a fait exclure « toute lecture identifiante »
// du perimetre de ce journal : un journal volumineux ou l'essentiel se noie).
//
// URL DECLAREE de la route, telle que Fastify l'enregistre (`patientRouter`, prefixe
// `/patient` sous `tenantRoutes`) -- exactement la forme que lit `request.routeOptions.url`,
// comme pour `LOGGED_PATIENT_ROUTES` ci-dessus.
export const PATIENT_EXPORT_ROUTE_URL = '/e/:establishmentId/s/:serviceId/patient/export'

export type PatientExportQuery = {
  search?: string
  pathwayTemplateTags?: string | string[]
}

// Les CRITERES de l'export, tels que journalises -- jamais son resultat, jamais la chaine de
// requete brute. `search` est un texte libre (potentiellement un nom de patient, voir
// `utils/url-helper.ts`) ; c'est precisement pour cela que `PatientAccessLogDomain.record`
// (domain/patientAccessLog.domain.ts) refuse toute cle clinique dans `exportFilters` -- la
// seule barriere qui protege ce journal de contenu clinique, deja ecrite a la tache 2, et
// deliberement pas reecrite ici.
//
// `JSON.stringify` omet de lui-meme une propriete dont la valeur est `undefined` : un critere
// absent de la requete n'apparait donc jamais dans le JSON produit, sans condition explicite.
// Les etiquettes sont NORMALISEES EN TABLEAU, exactement comme le fait le gestionnaire de la
// route (`routes/patient.ts`) avant de filtrer. Sans cela, un export sur une seule etiquette
// serait filtre sur `["asthme"]` mais journalise comme `"asthme"` : qui relirait le journal
// lirait une forme de critere qui n'est pas celle qui a reellement ete appliquee. Le journal
// doit dire ce qui s'est passe, pas ce que la chaine de requete avait l'air de demander.
export const buildPatientExportFilters = (query: PatientExportQuery): string => {
  const tags = query.pathwayTemplateTags
  return JSON.stringify({
    search: query.search,
    pathwayTemplateTags:
      tags === undefined ? undefined : Array.isArray(tags) ? tags : [tags],
  })
}

export type PlannedPatientExportAccess = {
  action: 'export'
  exportCount: number
  exportFilters: string
}

// Ce qu'il y a a journaliser pour l'export, ou `null` si cette route n'est pas celle-ci, ou si
// le nombre de dossiers rendus n'est pas encore connu. `exportCount` vient du handler
// (`routes/patient.ts`) via `request.patientExportCount` : seul le handler sait combien de
// dossiers l'export a effectivement rendus -- le recalculer ici rejouerait la meme requete en
// base une seconde fois, avec un risque de divergence si un patient a ete cree ou supprime
// entre les deux lectures. Sur le chemin de succes (la seule qui atteint ce point, voir la
// garde de statut du crochet), le handler l'a TOUJOURS pose avant de repondre : `undefined` ici
// signale un bug d'assemblage, pas un cas normal, et le crochet appelant le journalise en
// consequence plutot que d'ecrire une ligne au compte inconnu.
export const plannedPatientExportAccess = (
  url: string | undefined,
  query: PatientExportQuery | undefined,
  exportCount: number | undefined,
): PlannedPatientExportAccess | null => {
  if (url !== PATIENT_EXPORT_ROUTE_URL || exportCount === undefined) {
    return null
  }
  return {
    action: 'export',
    exportCount,
    exportFilters: buildPatientExportFilters(query ?? {}),
  }
}

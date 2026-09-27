import type { AccessAction } from '../types/domain/patientAccessLog.domain.interface'

// LE NOM DU PARAMETRE N'EST PAS UNIFORME DANS CE DEPOT, et c'est une vraie chausse-trape :
// `patientRouter`, `patientServiceFileRouter` et `enrollmentIssueRouter` ecrivent `:patientID`,
// `diagnosticEducatifRouter` ecrit `:patientId` (routes/tenant.routes.ts, ligne du prefixe
// `/patient/:patientId/diagnostic`). Une detection litterale sur `:patientID` aurait laisse les
// TROIS routes de diagnostic hors du garde-fou sans que rien ne le dise — donc hors du journal.
// La recherche est insensible a la casse, et rend l'orthographe REELLE du parametre pour que le
// crochet lise `request.params` sous le bon nom plutot que de deviner.
//
// La borne `(?![A-Za-z0-9_])` evite qu'un futur `:patientIDs` (ou `:patientIdentity`) passe pour
// un identifiant de patient.
const PATIENT_PARAM_RE = /:(patientId)(?![A-Za-z0-9_])/i

// Rend le nom exact du parametre de patient porte par l'URL declaree d'une route, ou `null`.
// Un seul endroit sait ce que « cette route designe un dossier identifie » veut dire : le
// garde-fou de demarrage et le crochet d'ecriture s'en servent tous les deux, donc ils ne
// peuvent pas diverger.
export const patientIdParamOf = (url: string): string | null =>
  PATIENT_PARAM_RE.exec(url)?.[1] ?? null

// Les routes de lecture qui designent un dossier identifie. Toute route GET dont l'URL porte un
// parametre de patient doit figurer dans l'une des deux listes, ou le serveur refuse de demarrer
// (voir `assertPatientReadLogged`, interfaces/http/fastify/plugins/tenant.plugin.ts). Les deux
// listes sont comparees aux routes REELLES, dans les deux sens : une entree morte fait echouer
// le demarrage elle aussi (`assertNoDeadPatientAccessEntry`, crochet `onReady` pose par
// routes/tenant.routes.ts).
//
// PORTEE EXACTE, ce que ces listes ne disent pas : le garde-fou et le crochet d'ecriture sont
// tous les deux poses par `tenantRoutes` (routes/tenant.routes.ts), donc ils voient exactement
// les memes routes — une entree de `LOGGED_PATIENT_ROUTES` est donc toujours reellement
// journalisee, jamais promise en l'air. La contrepartie, IDENTIQUE a celle que le commentaire
// d'`assertTenantShapedRoute` documente deja pour les permissions : une route de forme
// « patient » qui serait enregistree HORS de `tenantRoutes` echapperait aux deux. Rien dans ce
// fichier ne la rattraperait.
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
}

// Chaque exemption porte sa raison en clair. Une exemption se justifie POSITIVEMENT : le defaut
// est de journaliser.
//
// La tache 5 ajoutera `/e/:establishmentId/s/:serviceId/patient/:patientID/acces` — la route qui
// LIT le journal. Elle portera elle-meme un parametre de patient et devra donc venir ici, avec
// pour raison que lire le journal des consultations d'un dossier n'est pas consulter ce dossier :
// elle ne rend aucune identite ni aucun contenu clinique, seulement la liste de qui a ouvert
// quoi et quand. La journaliser ferait de plus grossir le journal a chaque fois qu'on le
// consulte, jusqu'a noyer les acces de soin sous les acces d'audit. Elle n'est PAS inscrite ici
// aujourd'hui : une entree morte fait echouer le demarrage (voir plus haut), donc elle
// s'ajoutera avec la route, pas avant.
export const EXEMPTED_PATIENT_ROUTES: Record<string, string> = {
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathways':
    "appelee par l'ecran du dossier en meme temps que l'ouverture : la journaliser doublerait chaque ligne sans rien apprendre",
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathway/:pathwayID/appointments-count':
    'rend un nombre, aucune identite, aucun contenu',
  // ECART ASSUME, et le plus discutable des trois (voir le rapport de tache : a trancher).
  // `enrollmentIssuesResponseSchema` (schemas/enrollmentIssue.schema.ts) borne la reponse a
  // l'identifiant de l'echec, celui du modele de parcours, son nom, un motif technique et deux
  // dates : aucune identite de patient, aucun champ clinique. Elle est exemptee plutot que
  // journalisee parce qu'aucune des trois valeurs d'`AccessAction` ne la decrirait sans mentir —
  // ecrire `sousDossier.ouvert` ferait croire, a qui relit le journal, qu'un contenu de dossier a
  // ete lu. Si la tracer est voulu, il faut une quatrieme action, pas une etiquette approximative.
  '/e/:establishmentId/s/:serviceId/patient/:patientID/enrollment-issue':
    "rend les echecs d'inscription a un parcours (motif technique, dates) : aucune identite, aucun contenu clinique",
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

import { Prisma } from '../../../generated/client'
import type {
  TenantContextInterface,
  TenantStore,
} from '../../types/utils/tenant-context'
import { TenantScopeMissingError } from '../../utils/tenant-errors'

// Modèles rattachés à un service : portent serviceId ET establishmentId.
export const SERVICE_MODELS: readonly string[] = [
  'PathwayTemplate',
  'SlotTemplate',
  'Pathway',
  'Slot',
  'Appointment',
  'AppointmentPatient',
  'Thematic',
  'DiagnosticEducatifTemplate',
  'DiagnosticEducatif',
  'EnrollmentIssue',
  'PatientPathwayPriority',
  'ForbiddenWeek',
  'PlanningCycle',
  'Todo',
  'SlotTemplateSoignant',
  'SoignantThematic',
  'PatientServiceFile',
]

// Modèles rattachés à un établissement : portent establishmentId.
export const ESTABLISHMENT_MODELS: readonly string[] = [
  'Patient',
  'Soignant',
  'Location',
  'Service',
  'EstablishmentMembership',
  'ServiceMembership',
  'ActivityLog',
]

// Le contexte `superadmin` n'est PAS `system`. `system` retire l'exigence de filtre pour toute
// opération ; l'invariant n'est PAS un nombre d'appels (qui grossit au fil des tâches légitimes)
// mais le fait que chaque emploi soit DÉCLARÉ (énuméré, avec sa raison) et que sa requête porte
// SES PROPRES BORNES explicites — un test garde cette propriété (runAsSystem-unicite.test.ts).
// Ici, la liste
// ci-dessous est exhaustive : tout couple (modèle, opération) absent est refusé comme sans
// contexte. Le super-admin compte, il ne lit pas — d'où l'absence de `findMany` sur `Patient`.
//
// CE QUE CETTE LISTE REFUSE, ET LE CONTOURNEMENT SÛR (tour de correction 3, Important de la
// revue) — lisez ceci AVANT d'ajouter une entrée ici pour contourner un refus des tâches 6, 7 ou
// 9. `assertNoGlobalBridgeUnderSuperAdmin` (plus bas dans ce fichier) refuse, sous superadmin,
// toute relation imbriquée qui franchit un modèle GLOBAL (`User`, `Establishment`) — dans un sens
// comme dans l'autre. Concrètement, sont refusés :
//   - `EstablishmentMembership.create` ou `.findMany` avec `include: { user: true }` ;
//   - `User.findMany` avec `include: { establishmentMemberships: true }` ;
//   - `Service.findMany` avec `include: { establishment: true }`.
// Ce n'est PAS un oubli à réparer en ajoutant `User`/`Establishment` ici : cette liste-ci ne
// concerne QUE les modèles de tenant, et un modèle global ne l'atteint jamais (voir
// assertTenantScope : `family === 'global'` sort par assertGlobalScope avant la porte de
// permission). Les modèles globaux ont leur propre table, SUPERADMIN_GLOBAL_OPERATIONS, plus bas.
// Le contournement sûr est donc de NE PAS utiliser `include` : faire deux requêtes séparées —
// l'une sur le modèle de tenant (déjà déclaré ici), l'autre sur `User`/`Establishment` par ses
// identifiants (`where: { id: { in: [...] } }`, une lecture déclarée dans l'autre table) — puis
// joindre en mémoire, côté application. Deux lectures et une jointure en JS coûtent plus cher
// qu'un `include`, mais restent sûres : chaque requête reste dans son propre modèle, sans jamais
// traverser le pont qu'un `include` imbriqué ouvrirait.
//
// CÔTÉ ÉCRITURE (tour de correction 4, ce que le paragraphe ci-dessus ne disait pas) : une
// écriture sur un modèle GLOBAL sous superadmin — créer un établissement, un compte, un lien
// d'accès, un octroi — ne se déclare pas ici non plus, mais dans SUPERADMIN_GLOBAL_OPERATIONS.
// Elle n'ouvre que sa propre ligne : toute écriture IMBRIQUÉE sous son `data` (un
// `patients: { create: … }` accroché à un `Establishment.create`) reste refusée, comme l'est
// l'`include` équivalent. Pour rattacher une ligne de tenant à la ligne globale qu'on vient de
// créer, il faut donc une seconde écriture, déclarée dans CETTE liste-ci
// (`EstablishmentMembership.create`), et non une écriture imbriquée.
export const SUPERADMIN_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  Service: ['count', 'findMany'],
  EstablishmentMembership: ['count', 'findMany', 'create'],
  ServiceMembership: ['count', 'findMany'],
  Patient: ['count'],
  ActivityLog: ['findMany', 'count'],
}

// Relations dont les écritures imbriquées sont vérifiées (parent → champ → enfant). C'est une
// liste blanche qui EXIGE : toute écriture imbriquée sur une relation absente d'ici est refusée
// (voir assertNestedRelations), plutôt que laissée sans contrôle. Contrairement à
// MODEL_RELATIONS, elle n'a pas à être exhaustive : elle ne recense que les relations pour
// lesquelles une écriture imbriquée existe réellement dans le code, ajoutées au fil de l'eau. Une
// relation absente d'ici n'ouvre donc rien — le verbe imbriqué est refusé tant qu'elle n'y est
// pas — d'où l'absence de test « toute relation du schéma doit y figurer » côté
// tenant-guard-schema.test.ts. Ce test y vérifie seulement l'autre sens : aucune entrée ne doit
// désigner une relation qui n'existe plus (ou plus sous ce nom) dans le schéma.
export const NESTED_RELATIONS: Record<string, Record<string, string>> = {
  Appointment: { appointmentPatients: 'AppointmentPatient' },
  Slot: { appointments: 'Appointment' },
  Pathway: { slots: 'Slot' },
  PathwayTemplate: { slotTemplates: 'SlotTemplate' },
  SlotTemplate: { soignantLinks: 'SlotTemplateSoignant', slot: 'Slot' },
  Thematic: { soignantLinks: 'SoignantThematic' },
  Soignant: { slotTemplateLinks: 'SlotTemplateSoignant', thematicLinks: 'SoignantThematic' },
  EstablishmentMembership: { serviceMemberships: 'ServiceMembership' },
  Patient: {
    appointmentPatients: 'AppointmentPatient',
    serviceFiles: 'PatientServiceFile',
  },
}

// Relations d'un modèle global qui exposent des données de tenant. Un include/select dessus ne
// peut être laissé passer que sur une opération ciblant une seule ligne (findUnique(OrThrow)) :
// c'est la seule façon de garantir que les enfants renvoyés appartiennent à un seul tenant.
//
// Ce contrôle ÉCHOUE OUVERT : une relation absente de cette table n'est simplement pas vue, donc
// l'include passe sans contrôle. La table porte donc une obligation d'exhaustivité, tenue par
// `tenant-guard-schema.test.ts`, qui relit prisma/schema.prisma — mais une obligation plus
// étroite que celle de MODEL_RELATIONS plus bas, et il faut lire la différence : toute
// relation d'un modèle global MENANT A UN MODELE DE TENANT doit figurer ici, et toute entrée
// d'ici doit exister au schéma. Ce qui n'est PAS exigé, c'est de déclarer les relations qui ne
// mènent pas à du tenant : déclarer une relation ici la RESTREINT (plus d'include hors
// findUnique), et une exigence d'égalité stricte forcerait à restreindre, par exemple, un futur
// `User.notificationPreferences` sans aucun rapport avec le cloisonnement. Le test tient à la
// place la liste — vide à ce jour — de ces relations-là, pour qu'aucune n'entre au schéma sans
// qu'on ait tranché. (Avant ce test, la table avait déjà dérivé : elle désignait un
// `User.soignant` disparu depuis l'étape 1, où le lien vers `Soignant` est passé à
// `EstablishmentMembership`.)
//
// `User` et `Establishment` ne sont ni dans SERVICE_MODELS ni dans ESTABLISHMENT_MODELS : ce sont
// des modèles globaux. Toutes leurs relations vers un modèle de TENANT sont listées ci-dessous ;
// depuis la tâche 2 (étape 4a), ils portent aussi chacun une relation vers un autre modèle
// global (`User.accessLinks` -> `AccessLink`, `User.superAdminAccessGrants` et
// `Establishment.superAdminAccessGrants` -> `SuperAdminAccessGrant`) qui n'a donc pas sa place
// ici : voir `tenant-guard-schema.test.ts` (SANS_DONNEE_DE_TENANT) pour l'énoncé de ce choix.
export const GLOBAL_TENANT_RELATIONS: Record<string, readonly string[]> = {
  User: ['establishmentMemberships'],
  Establishment: [
    'services',
    'memberships',
    'patients',
    'soignants',
    'locations',
  ],
}

// Relations de TOUS les modèles du schéma (parent → champ → modèle cible), pas seulement ceux
// d'établissement. Noms repris un par un de prisma/schema.prisma : toute relation ajoutée
// là-bas doit l'être ici. La table est exhaustive et c'est une liste blanche : un `include` sur
// une relation absente d'ici est refusé (voir assertNestedInclude) plutôt que laissé sans
// contrôle — y compris pour un modèle qui n'aurait aucune relation déclarée (`ActivityLog`,
// `ForbiddenWeek`, `PlanningCycle` : entrée `{}`, donc toute clé y est absente).
//
// DÉCISION DE CONCEPTION (tâche 9, étape 3) — cette table était TENANT_CHILD_RELATIONS,
// limitée aux modèles d'établissement (7 entrées) ; fermer la limite documentée plus bas
// (assertNestedInclude) exige de savoir, pour N'IMPORTE QUEL modèle atteint en cours de
// descente — pas seulement un modèle d'établissement — quelles relations il porte et vers
// quelle cible, afin de continuer à descendre et d'y reconnaître une éventuelle transition
// établissement → service. Deux voies étaient possibles :
//   1. écrire cette table à la main pour les 26 modèles du schéma, tenue par
//      `tenant-guard-schema.test.ts` dans les deux sens (comme TENANT_CHILD_RELATIONS l'était
//      déjà) ;
//   2. la dériver du schéma plutôt que l'écrire — le dépôt lit déjà prisma/schema.prisma dans
//      ses tests de conformité (`relationsOf`), donc le précédent existe.
// Choix : la voie 1, conservée et étendue. Deux raisons, une déjà actée par le dépôt et une
// propre à cette table :
//   - `docs/multi-tenant/decisions-etape-1.md` (R12) a déjà tranché la question générale pour
//     ce garde-fou : le générateur Prisma de ce projet n'expose aucune métadonnée de relations
//     à l'exécution (`Prisma.dmmf` absent côté client public — le seul point d'accès qui
//     existe, `runtimeDataModel` dans `src/generated/internal/class.ts`, est un fichier interne
//     que Prisma marque lui-même « sous aucun prétexte à importer directement »). Dériver
//     signifierait donc relire et re-parser `prisma/schema.prisma` à l'exécution — un analyseur
//     regex qui n'a jamais été conçu pour tourner en dehors des tests, dans le composant dont un
//     défaut ouvre l'accès à des données de santé sans bruit. (Ce n'est PAS un argument de
//     performance : un tel analyseur se construirait une fois, en portée haute, au chargement du
//     module — mesuré à 0,48 ms pour les 26 modèles du schéma — et `schema.prisma` est de toute
//     façon livré dans l'image de production, voir `deploy/Dockerfile`. C'est un argument de
//     surface de risque : mieux vaut ne pas ajouter, dans le composant qui protège les données de
//     santé, un analyseur que rien n'oblige à écrire.)
//   - la voie 2 ne supprime de toute façon pas le travail à la main, elle le déplace : ce
//     qu'il faut alors garder explicite et déclaré, c'est la FAMILLE d'un modèle (service,
//     établissement, global — SERVICE_MODELS / ESTABLISHMENT_MODELS ci-dessus) puisque c'est
//     elle, et seulement elle, qui décide si une relation doit porter un filtre. Cette partie
//     reste de toute façon écrite à la main dans les deux approches ; seule la table des
//     relations elle-même changerait de source. Le graphe complet ne se périme pas s'il est
//     dérivé, mais il ne fait courir aucun risque non plus une fois écrit à la main : il compte
//     26 modèles (vérifié : `prisma/schema.prisma` n'en a pas plus), le test de conformité
//     rougit dans les deux sens à la moindre relation ajoutée, renommée ou supprimée, et la
//     table reste lisible dans une revue de code — un diff sur ce fichier montre exactement
//     quelle relation change de statut, alors qu'un diff sur un script d'extraction ne le
//     montre pas.
//
// Les entrées dont le modèle cible appartient à SERVICE_MODELS ET dont le modèle PORTEUR
// (celui qui déclare la relation) appartient à ESTABLISHMENT_MODELS exigent en plus un filtre
// explicite sur le service courant, à l'endroit précis de la transition — voir
// assertNestedInclude : partir d'une ligne d'établissement et descendre dans un modèle de
// service ramène sinon les enfants de TOUS les services. C'est exactement la fuite trouvée à
// l'étape 1 (un patient remontait les problèmes d'inscription de tous les services), d'abord
// corrigée repository par repository, puis au premier niveau seulement par cette table
// (étape 2), et maintenant à n'importe quelle profondeur d'inclusion imbriquée (étape 3).
//
// Exportée pour `tenant-guard-schema.test.ts`, qui relit prisma/schema.prisma et échoue si une
// relation y a été ajoutée, renommée ou supprimée sans être répercutée ici. C'est ce test qui
// garantit l'exhaustivité de la table, et donc que le contrôle du `select` ci-dessous — qui ne
// peut pas, lui, exiger la déclaration — ne laisse rien passer.
export const MODEL_RELATIONS: Record<string, Record<string, string>> = {
  // Modèles globaux.
  User: {
    establishmentMemberships: 'EstablishmentMembership',
    accessLinks: 'AccessLink',
    superAdminAccessGrants: 'SuperAdminAccessGrant',
  },
  Establishment: {
    services: 'Service',
    memberships: 'EstablishmentMembership',
    patients: 'Patient',
    soignants: 'Soignant',
    locations: 'Location',
    superAdminAccessGrants: 'SuperAdminAccessGrant',
  },
  // Tâche 2, étape 4a : `AccessLink` et `SuperAdminAccessGrant` sont globaux eux aussi (voir
  // SUPERADMIN_GLOBAL_OPERATIONS plus bas) — leurs relations pointent vers d'autres modèles
  // globaux (`User`, `Establishment`), jamais vers du tenant.
  AccessLink: {
    user: 'User',
  },
  SuperAdminAccessGrant: {
    user: 'User',
    establishment: 'Establishment',
  },
  // Modèles d'établissement.
  Patient: {
    establishment: 'Establishment',
    appointmentPatients: 'AppointmentPatient',
    pathwayPriorities: 'PatientPathwayPriority',
    serviceFiles: 'PatientServiceFile',
  },
  Soignant: {
    establishment: 'Establishment',
    slotTemplateLinks: 'SlotTemplateSoignant',
    thematicLinks: 'SoignantThematic',
    todos: 'Todo',
    memberships: 'EstablishmentMembership',
  },
  Location: {
    establishment: 'Establishment',
    slotTemplates: 'SlotTemplate',
  },
  Service: {
    establishment: 'Establishment',
    memberships: 'ServiceMembership',
    patientServiceFiles: 'PatientServiceFile',
  },
  EstablishmentMembership: {
    user: 'User',
    establishment: 'Establishment',
    soignant: 'Soignant',
    serviceMemberships: 'ServiceMembership',
  },
  ServiceMembership: {
    establishmentMembership: 'EstablishmentMembership',
    service: 'Service',
  },
  // `ActivityLog` ne déclare aucune relation dans le schéma : tout include y est donc refusé.
  ActivityLog: {},
  // Modèles de service.
  PathwayTemplate: {
    pathways: 'Pathway',
    slotTemplates: 'SlotTemplate',
  },
  SlotTemplate: {
    slot: 'Slot',
    soignantLinks: 'SlotTemplateSoignant',
    template: 'PathwayTemplate',
    location: 'Location',
    thematic: 'Thematic',
  },
  Pathway: {
    template: 'PathwayTemplate',
    slots: 'Slot',
    patientPriorities: 'PatientPathwayPriority',
  },
  Slot: {
    appointments: 'Appointment',
    pathway: 'Pathway',
    slotTemplate: 'SlotTemplate',
  },
  Appointment: {
    appointmentPatients: 'AppointmentPatient',
    slot: 'Slot',
    thematic: 'Thematic',
  },
  AppointmentPatient: {
    appointment: 'Appointment',
    patient: 'Patient',
  },
  Thematic: {
    soignantLinks: 'SoignantThematic',
    appointments: 'Appointment',
    slotTemplates: 'SlotTemplate',
  },
  DiagnosticEducatifTemplate: {
    diagnostics: 'DiagnosticEducatif',
  },
  DiagnosticEducatif: {
    template: 'DiagnosticEducatifTemplate',
    serviceFile: 'PatientServiceFile',
  },
  EnrollmentIssue: {
    serviceFile: 'PatientServiceFile',
  },
  PatientPathwayPriority: {
    patient: 'Patient',
    pathway: 'Pathway',
  },
  // `ForbiddenWeek` et `PlanningCycle` ne déclarent aucune relation dans le schéma.
  ForbiddenWeek: {},
  PlanningCycle: {},
  Todo: {
    soignant: 'Soignant',
  },
  SlotTemplateSoignant: {
    slotTemplate: 'SlotTemplate',
    soignant: 'Soignant',
  },
  SoignantThematic: {
    soignant: 'Soignant',
    thematic: 'Thematic',
  },
  PatientServiceFile: {
    patient: 'Patient',
    service: 'Service',
    diagnostics: 'DiagnosticEducatif',
    enrollmentIssues: 'EnrollmentIssue',
  },
}

const UNIQUE_READ_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow'])

const READ_OPERATIONS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'update', 'updateMany', 'updateManyAndReturn',
  'delete', 'deleteMany', 'upsert', 'count', 'aggregate', 'groupBy',
])
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert'])
// Sous-ensemble des opérations de lecture dont le `data` peut déplacer une ligne d'un tenant à
// l'autre (voir assertNoTenantMove). Le `update` d'un upsert est traité séparément : sa clé
// (args.update) ne coïncide pas avec args.data.
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn'])

// TOUR DE CORRECTION 3 (tâche 1) — Critique de la revue : une racine GLOBALE contournait
// entièrement SUPERADMIN_OPERATIONS. `assertTenantScope` retourne via `assertGlobalScope` dès
// que `family === 'global'`, AVANT même d'atteindre la porte de permission
// (`assertSuperAdminOperationDeclared`, plus bas) — un modèle global ne franchit tout simplement
// jamais cette porte. Démontré : `Establishment.deleteMany({})` (aucune colonne de tenant à
// vérifier sur un modèle global, donc rien ne s'y opposait) purgeait la table entière.
//
// Remède retenu au tour 3 : les lectures qui ne mutent rien restaient permises, toute mutation
// d'une table globale était refusée.
//
// TOUR DE CORRECTION 4 (tâche 1) — Critique de la re-revue : ce remède fermait TROP, et sans
// laisser de porte. `SUPERADMIN_SAFE_GLOBAL_OPERATIONS` était un ensemble d'OPÉRATIONS sans
// distinction de modèle : dix-huit couples (modèle, opération) sont passés de permis à refusés
// d'un seul geste, dont les écritures dont quatre tâches du plan dépendent. Aucune ne pouvait être
// rouverte : un modèle global n'atteint JAMAIS `assertSuperAdminOperationDeclared` (le retour par
// `assertGlobalScope` a lieu avant), donc l'ajouter à SUPERADMIN_OPERATIONS n'aurait rien changé ;
// et ajouter `create` à l'ancien ensemble aurait rouvert `Establishment.create` pour n'importe
// quoi, `deleteMany` aurait rouvert `Establishment.deleteMany({})` — le trou que le tour 3 venait
// de fermer. Le reste du fichier a partout ailleurs la granularité PAR MODÈLE ; il ne l'avait pas
// ici.
//
// Cette table est donc, pour les modèles globaux, la symétrique exacte de SUPERADMIN_OPERATIONS :
// sous superadmin, un couple (modèle, opération) absent est refusé comme sans contexte, et un
// modèle global absent de la table l'est en entier, LECTURE COMPRISE. Elle vaut pour le seul
// contexte superadmin : sans contexte, sous tenant ou sous système, un modèle global reste traité
// comme avant (voir assertGlobalScope). Ce qu'elle ne remplace pas : un `include`/`select` qui
// franchit la frontière global/tenant reste refusé sous superadmin quoi qu'elle déclare
// (assertNoGlobalBridgeUnderSuperAdmin), et les écritures IMBRIQUÉES sous un `data` déclaré ici
// repassent par assertNestedRelations, qui les refuse toutes faute d'entrée dans NESTED_RELATIONS.
//
// POURQUOI CHAQUE ÉCRITURE Y FIGURE, une par une — et pourquoi les voisines n'y sont pas :
//   - `User.create` : tâches 6 (premier administrateur) et 10 (compte de membre). PAS `upsert` :
//     la tâche 6 step 2 exige qu'une adresse déjà connue ne soit NI écrasée ni distinguable dans
//     la réponse, donc une lecture suivie d'une création, jamais un upsert qui écraserait le nom
//     ou le mot de passe. PAS `update` : `lastLoginAt` (tâche 7 step 4) est posé sur le chemin de
//     connexion, qui n'a aucun contexte, et la désactivation d'un membre (tâche 10 step 2) se fait
//     sous contexte tenant, où un modèle global n'est pas soumis à cette table.
//   - `Establishment.create` : tâche 6. PAS `update`/`delete(Many)` : aucune route de ce plan ne
//     modifie ni ne supprime un établissement sous ce contexte.
//   - `AccessLink.create` + `updateMany` : tâches 4, 6 et 10 — émettre un lien, et invalider les
//     liens précédents du même compte à la réémission (`updateMany` conditionné sur
//     `usedAt: null`, tâche 4 steps 1 et 3).
//   - `SuperAdminAccessGrant.create` + `update` : tâche 8. PAS `delete` (que la revue attendait
//     ici) : le modèle porte `revokedAt DateTime?` (spécification §5) et la tâche 8 step 4 exige
//     que `GET /e/:establishmentId/grants` rende les octrois « en cours ET PASSÉS, avec leur motif
//     et leur auteur ». Supprimer la ligne détruirait précisément la trace comptable qui justifie
//     le mécanisme : révoquer est un `update` qui pose `revokedAt`, pas un `delete`. PAS
//     `deleteMany` non plus, pour la même raison.
//
// `AccessLink` et `SuperAdminAccessGrant` ont été déclarés ici d'avance, avant d'exister au
// schéma (tâche 1), parce que la tâche 2 les veut GLOBAUX à dessein (« Ne les ajoute ni à
// SERVICE_MODELS ni à ESTABLISHMENT_MODELS ») et que `familyOf` rend « global » par défaut pour
// tout modèle qu'il ne connaît pas — sans cette déclaration, les tâches 4, 6, 8 et 10 se
// seraient heurtées au refus au milieu d'une tâche de fonctionnalité. Les deux tables existent
// désormais au schéma (tâche 2) ; les opérations ci-dessous ont été relues contre les modèles
// réels (`usedAt`/`revokedAt` confirmés) et n'ont pas changé.
//
// AJOUTER UN MODÈLE GLOBAL AU SCHÉMA SANS ENTRÉE ICI ne l'ouvre pas : il est refusé en entier sous
// superadmin (échec FERMÉ), et le refus dit quel couple manque.
const LECTURES_GLOBALES_SANS_MUTATION: readonly string[] = [
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
]

export const SUPERADMIN_GLOBAL_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  User: [...LECTURES_GLOBALES_SANS_MUTATION, 'create'],
  Establishment: [...LECTURES_GLOBALES_SANS_MUTATION, 'create'],
  AccessLink: [...LECTURES_GLOBALES_SANS_MUTATION, 'create', 'updateMany'],
  SuperAdminAccessGrant: [...LECTURES_GLOBALES_SANS_MUTATION, 'create', 'update'],
}

// Verbes Prisma d'écriture imbriquée : la présence de l'un d'eux dans la valeur d'un champ
// signale une relation à vérifier plutôt qu'une simple colonne scalaire.
const WRITE_VERBS = [
  'create', 'createMany', 'connectOrCreate', 'connect', 'set',
  'update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'disconnect',
]

type Family = 'service' | 'establishment' | 'global'

const familyOf = (model: string): Family => {
  if (SERVICE_MODELS.includes(model)) {
    return 'service'
  }
  if (ESTABLISHMENT_MODELS.includes(model)) {
    return 'establishment'
  }
  return 'global'
}

type Dict = Record<string, unknown>
const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)

// Lit `field` au premier niveau du where, ou dans une clé composite (convention Prisma : les
// clés uniques composées concatènent leurs champs avec `_`, ex. `id_serviceId`,
// `appointmentId_patientId`). On exige cette `_` avant de descendre dans une valeur objet :
// aucun nom de champ ou de relation de ce schéma n'en contient, ce qui exclut naturellement les
// opérateurs logiques (OR/AND/NOT) et les filtres de relation (`{ slot: { serviceId: … } }`),
// qui doivent continuer à être refusés faute de filtre direct sur la ligne elle-même.
const whereValue = (where: unknown, field: string): unknown => {
  if (!isDict(where)) {
    return undefined
  }
  if (field in where) {
    return where[field]
  }
  for (const [key, value] of Object.entries(where)) {
    if (key.includes('_') && isDict(value) && field in value) {
      return value[field]
    }
  }
  return undefined
}

const expectedValue = (store: TenantStore, field: string, model: string, operation: string): string => {
  if (store.kind !== 'tenant') {
    throw new TenantScopeMissingError(model, operation, field)
  }
  const value = field === 'serviceId' ? store.tenant.serviceId : store.tenant.establishmentId
  // Refuse toute valeur qui n'est pas une chaîne non vide : un champ absent plutôt qu'à `null`
  // ne doit jamais se comparer par accident à un `where` sans filtre (les deux valant
  // `undefined`).
  if (typeof value !== 'string' || value.length === 0) {
    throw new TenantScopeMissingError(model, operation, field)
  }
  return value
}

const assertWhereLike = (
  model: string,
  operation: string,
  where: unknown,
  field: string,
  store: TenantStore,
): void => {
  const expected = expectedValue(store, field, model, operation)
  if (whereValue(where, field) !== expected) {
    throw new TenantScopeMissingError(model, operation, field)
  }
}

const assertWhere = (model: string, operation: string, args: Dict, field: string, store: TenantStore): void =>
  assertWhereLike(model, operation, args.where, field, store)

// Empêche un update de déplacer une ligne d'un tenant à l'autre : si serviceId ou
// establishmentId figure dans les données, sa valeur doit être celle du tenant courant. Absent,
// c'est le cas normal (l'update ne touche pas à ces colonnes) et on laisse passer.
const assertNoTenantMove = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  if (!isDict(data)) {
    return
  }
  const family = familyOf(model)
  if (family === 'service' && 'serviceId' in data && data.serviceId !== expectedValue(store, 'serviceId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'serviceId')
  }
  if (family !== 'global' && 'establishmentId' in data && data.establishmentId !== expectedValue(store, 'establishmentId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'establishmentId')
  }
}

// Vérifie que `row` porte les colonnes de tenant attendues pour son modèle.
const assertRowScope = (model: string, operation: string, row: Dict, store: TenantStore): void => {
  const family = familyOf(model)
  if (family === 'service' && row.serviceId !== expectedValue(store, 'serviceId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'serviceId')
  }
  if (family !== 'global' && row.establishmentId !== expectedValue(store, 'establishmentId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'establishmentId')
  }
}

const isNestedWrite = (value: unknown): value is Dict =>
  isDict(value) && WRITE_VERBS.some((verb) => verb in value)

// Prisma accepte partout la valeur seule ou un tableau de valeurs.
const asEntries = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value]

// `connect` / `set` : chaque entrée doit porter, directement ou via une clé composite, la
// colonne de tenant de la famille de l'enfant — sinon on pourrait rattacher à la ligne courante
// un enregistrement d'un autre tenant qui existe déjà.
const assertConnectEntries = (
  model: string,
  operation: string,
  value: unknown,
  field: string,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    assertWhereLike(model, operation, entry, field, store)
  }
}

// `connectOrCreate` : la branche `create` est vérifiée comme un create (récursif, colonnes
// exigées), la branche `where` comme un connect (colonne de tenant exigée).
const assertConnectOrCreate = (
  model: string,
  operation: string,
  value: unknown,
  field: string,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    if (!isDict(entry)) {
      continue
    }
    if ('create' in entry) {
      assertData(model, `${operation}.create`, entry.create, store)
    }
    assertWhereLike(model, `${operation}.where`, entry.where, field, store)
  }
}

// Un `upsert` imbriqué crée ou met à jour un enfant : sa branche `create` est vérifiée comme
// un create (colonnes de tenant exigées, récursif), sa branche `update` comme une charge de
// mise à jour. La valeur peut être un objet ou un tableau.
const assertNestedUpsert = (
  childModel: string,
  operation: string,
  value: unknown,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    if (!isDict(entry)) {
      continue
    }
    if ('create' in entry) {
      assertData(childModel, `${operation}.create`, entry.create, store)
    }
    assertUpdatePayload(childModel, `${operation}.update`, entry.update, store)
  }
}

// Un `update` / `updateMany` imbriqué ne choisit pas librement sa ligne (la relation s'en
// charge), mais rien n'empêcherait son `data` de déplacer l'enfant vers un autre tenant, ni d'y
// imbriquer une écriture non vérifiée. Prisma accepte la forme `{ where, data }` comme la forme
// courte où l'entrée EST le `data`.
const assertNestedUpdate = (
  childModel: string,
  operation: string,
  value: unknown,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    const data = isDict(entry) && 'data' in entry ? entry.data : entry
    assertUpdatePayload(childModel, operation, data, store)
  }
}

// Vérifie une écriture imbriquée déclarée, verbe par verbe.
const assertNestedWrite = (childModel: string, operation: string, value: Dict, store: TenantStore): void => {
  const field = familyOf(childModel) === 'service' ? 'serviceId' : 'establishmentId'
  if ('create' in value) {
    assertData(childModel, `${operation}.create`, value.create, store)
  }
  if (isDict(value.createMany) && 'data' in value.createMany) {
    assertData(childModel, `${operation}.createMany`, value.createMany.data, store)
  }
  if ('connectOrCreate' in value) {
    assertConnectOrCreate(childModel, `${operation}.connectOrCreate`, value.connectOrCreate, field, store)
  }
  if ('connect' in value) {
    assertConnectEntries(childModel, `${operation}.connect`, value.connect, field, store)
  }
  if ('set' in value) {
    assertConnectEntries(childModel, `${operation}.set`, value.set, field, store)
  }
  // `upsert` imbriqué : `'create' in value` ci-dessus capte le verbe `create`, pas
  // `upsert.create` — sa branche de création doit donc être vérifiée à part.
  if ('upsert' in value) {
    assertNestedUpsert(childModel, `${operation}.upsert`, value.upsert, store)
  }
  // `update` / `updateMany` imbriqués : la relation garantit QUELLE ligne est touchée, pas ce
  // qu'on y écrit.
  if ('update' in value) {
    assertNestedUpdate(childModel, `${operation}.update`, value.update, store)
  }
  if ('updateMany' in value) {
    assertNestedUpdate(childModel, `${operation}.updateMany`, value.updateMany, store)
  }
  // delete / deleteMany / disconnect imbriqués : aucun contrôle supplémentaire. Ils n'écrivent
  // aucune colonne, et Prisma ne peut les résoudre que parmi les enfants déjà rattachés à la
  // ligne parente (par la relation, pas par un identifiant libre), dont le `where` est déjà
  // vérifié ailleurs — ces enfants sont donc déjà dans le bon tenant. Le même raisonnement vaut
  // pour le CHOIX de la ligne d'un update/upsert imbriqué ; c'est sa CHARGE écrite, vérifiée
  // ci-dessus, qui ne l'était pas.
}

// Toute écriture imbriquée doit porter sur une relation déclarée dans NESTED_RELATIONS : une
// relation absente de la liste est refusée plutôt que laissée sans contrôle.
const assertNestedRelations = (model: string, operation: string, row: Dict, store: TenantStore): void => {
  const relations = NESTED_RELATIONS[model] ?? {}
  for (const [relationField, value] of Object.entries(row)) {
    if (!isNestedWrite(value)) {
      continue
    }
    const childModel = relations[relationField]
    if (!childModel) {
      throw new TenantScopeMissingError(
        model,
        operation,
        `relation '${relationField}' non déclarée — l'ajouter à NESTED_RELATIONS['${model}']`,
      )
    }
    assertNestedWrite(childModel, `${operation}>${relationField}`, value, store)
  }
}

const assertData = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) {
    if (!isDict(row)) {
      throw new TenantScopeMissingError(model, operation, 'data')
    }
    assertRowScope(model, operation, row, store)
    assertNestedRelations(model, operation, row, store)
  }
}

// TOUR DE CORRECTION 1 (tâche 1) — contrepartie, côté écriture, de assertTenantReadScope plus
// bas : `assertRowScope`, appelé par `assertData` ci-dessus, compare la ligne à UN tenant
// ambiant (`store.tenant`) — le superadmin n'en a aucun par construction, et sa seule écriture
// déclarée à ce jour (EstablishmentMembership.create, tâche 6) doit justement pouvoir porter
// N'IMPORTE QUEL établissement. `assertData` reste donc réservé, TEL QUEL, au contexte tenant et
// aux appels IMBRIQUÉS (voir plus bas) ; cette fonction couvre l'appel de tête sous superadmin —
// mêmes lignes, même récursion (`assertNestedRelations`), MOINS `assertRowScope`. C'est cette
// récursion qui referme le trou que la revue a trouvé : dès qu'une écriture imbriquée touche un
// modèle de tenant (`assertNestedWrite`, plus haut), elle retombe sur un nouvel appel à
// `assertData` — celui-là inchangé, donc avec sa propre vérification de `assertRowScope` — qui
// refuse alors (store toujours superadmin, jamais tenant) toute écriture imbriquée vers un
// tenant. Seule la ligne de TÊTE, celle que SUPERADMIN_OPERATIONS a explicitement autorisée,
// échappe à ce contrôle — pas ses enfants.
const assertSuperAdminWriteRow = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) {
    if (!isDict(row)) {
      throw new TenantScopeMissingError(model, operation, 'data')
    }
    assertNestedRelations(model, operation, row, store)
  }
}

// Choisit, pour l'appel de tête (pas les imbriqués, qui repassent toujours par assertData plus
// haut), le contrôle complet (tenant) ou la variante sans assertRowScope (superadmin).
const assertWriteData = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  if (store.kind === 'tenant') {
    assertData(model, operation, data, store)
    return
  }
  assertSuperAdminWriteRow(model, operation, data, store)
}

// Entrées effectivement demandées par un include/select. `false` écarte explicitement la
// relation ; `undefined` la laisse absente — c'est l'idiome d'une inclusion conditionnelle
// (`{ enrollmentIssues: withIssues ? { where } : undefined }`), que Prisma traite exactement
// comme une clé non écrite. Ni l'une ni l'autre ne ramène de ligne, donc ni l'une ni l'autre
// n'a à être filtrée.
const includedRelationEntries = (value: unknown): [string, unknown][] =>
  isDict(value)
    ? Object.entries(value).filter(([, included]) => included !== false && included !== undefined)
    : []

const includedRelationKeys = (value: unknown): string[] =>
  includedRelationEntries(value).map(([key]) => key)

// Un include/select depuis un modèle global qui touche une relation de tenant n'est sûr que sur
// une opération à une seule ligne (findUnique/findUniqueOrThrow) : c'est la seule garantie que
// les données incluses appartiennent à un seul tenant.
const assertGlobalInclude = (model: string, operation: string, args: Dict): void => {
  const tenantRelations = GLOBAL_TENANT_RELATIONS[model]
  if (!tenantRelations) {
    return
  }
  const requested = [...includedRelationKeys(args.include), ...includedRelationKeys(args.select)]
  const touchesTenantData = requested.some((key) => tenantRelations.includes(key))
  if (touchesTenantData && !UNIQUE_READ_OPERATIONS.has(operation)) {
    throw new TenantScopeMissingError(
      model,
      operation,
      'include/select sur une relation de tenant hors findUnique(OrThrow)',
    )
  }
}

// Une relation d'un modèle d'établissement vers un modèle de service doit porter son propre
// `where` sur le service courant : la ligne parente est filtrée par établissement, rien ne
// restreint ses enfants au service du tenant. Appelée par assertNestedInclude à CHAQUE
// transition établissement → service qu'elle rencontre en descendant, pas seulement au premier
// niveau — `model` désigne donc le modèle porteur de la relation à l'endroit précis de la
// transition, qui peut être bien plus profond que le modèle interrogé par la requête.
const assertServiceRelationFilter = (
  model: string,
  operation: string,
  relationField: string,
  value: unknown,
  store: TenantStore | undefined,
): void => {
  const detail =
    `include/select '${relationField}' vers un modèle de service sans filtre` +
    ` — ajouter { where: { serviceId } } sur '${relationField}'`
  // Le tenant courant peut n'avoir aucun service (administration d'établissement), ou n'exister
  // pas du tout (descente depuis une racine globale lue sans tenant, ex. la connexion) : dans les
  // deux cas il n'existe aucun service par lequel filtrer, et l'inclusion est refusée — jamais
  // laissée passer par défaut faute de store à comparer.
  const expected = store?.kind === 'tenant' ? store.tenant.serviceId : null
  if (typeof expected !== 'string' || expected.length === 0) {
    throw new TenantScopeMissingError(model, operation, detail)
  }
  if (!isDict(value) || whereValue(value.where, 'serviceId') !== expected) {
    throw new TenantScopeMissingError(model, operation, detail)
  }
}

// Contrôle les include/select depuis N'IMPORTE QUELLE racine — service, établissement OU globale
// —, RÉCURSIVEMENT. Pour une racine globale, complète assertGlobalInclude (qui ne garantit que la
// sûreté au premier niveau, sur une seule ligne) plutôt que de s'y substituer : les deux sont
// appelées l'une après l'autre par assertTenantScope. `store` y est donc `TenantStore |
// undefined` : une racine globale peut être lue SANS tenant en contexte (ex. la connexion, avant
// tenantContext.clear()), et cette descente doit rester utilisable dans ce cas — voir
// assertServiceRelationFilter, qui refuse plutôt que de laisser passer par défaut quand il n'y a
// aucun store à comparer à la transition établissement → service.
//
// Jusqu'à la tâche 9, ce contrôle n'inspectait que le PREMIER niveau des arguments, et seulement
// depuis un modèle d'établissement — voir git history pour le commentaire qui documentait cette
// limite et nommait les chaînes qui l'auraient rouverte (slot/pathway/appointment >
// appointmentPatients > patient, todo > soignant, thematic|slotTemplate|pathwayTemplate >
// soignantLinks > soignant, slotTemplate > location). Fermer ce cas suppose de suivre la famille
// du modèle courant le long de TOUTE la descente, pas seulement au premier niveau — d'où
// MODEL_RELATIONS plus haut, qui couvre désormais tous les modèles et pas seulement ceux
// d'établissement, et d'où l'appel à cette fonction pour toute racine de service ou
// d'établissement (voir assertTenantScope), pas seulement d'établissement : une chaîne comme
// appointment > appointmentPatients > patient > serviceFiles part d'un modèle de SERVICE
// (Appointment), et n'aurait jamais été vue si le contrôle était resté conditionné à
// `family === 'establishment'`.
//
// La règle appliquée à chaque relation traversée est purement LOCALE — elle ne dépend jamais du
// modèle interrogé par la requête (la racine), seulement du modèle PORTEUR de la relation à cet
// endroit précis de la descente : si son modèle est de famille 'establishment' et la cible de
// famille 'service', cette relation doit porter { where: { serviceId } }. C'est exactement la
// fuite fermée au premier niveau à l'étape 2, ici fermée à n'importe quelle profondeur.
//
// Échoue FERMÉ à chaque étape, y compris en profondeur : `include` n'accepte que des relations,
// toute clé doit donc être déclarée dans MODEL_RELATIONS[model] — une clé absente est refusée,
// jamais laissée passer en silence. `_count` (mot réservé Prisma, jamais un nom de relation) en
// est le cas explicite : refusé sous `include` (clé non déclarée) comme sous `select` (refus
// dédié — tour de correction 1 sur la relecture de la tâche 9 : `select`, qui mélange colonnes
// scalaires et relations, ne peut exiger la déclaration de tout le reste, mais `_count` ne
// collisionne jamais avec un nom de champ ou de relation du schéma). Et `model` peut très bien
// n'avoir AUCUNE relation connue (MODEL_RELATIONS[model]
// vaut alors {}, jamais `undefined` : la table est exhaustive sur les 26 modèles du schéma), ce
// qui refuse alors toute clé sans distinction. Une relation reconnue est en revanche toujours
// suivie plus loin par récursion, que la transition établissement → service s'y applique ou
// non : ne descendre que sous condition serait le point exact où un modèle ou une relation non
// reconnus pourraient être traités comme sûrs par défaut — la limite que cette fonction referme.

// TOUR DE CORRECTION 2 (tâche 1) — Critique 1 de la revue : un modèle GLOBAL sert de pont. La
// transition établissement → service, vérifiée juste en dessous, ne dit rien d'une relation vers
// un modèle GLOBAL (`Service.establishment`, `EstablishmentMembership.user`…) ni d'une relation
// REPARTANT d'un modèle global vers un modèle de tenant (`Establishment.patients`…) : ni l'une ni
// l'autre n'est une transition établissement → service, donc ni l'une ni l'autre n'était vérifiée.
//
// CE QUI SUIT EST VRAI UNIQUEMENT SOUS SUPERADMIN — corrigé au tour de correction 3, où la revue
// a montré qu'une affirmation antérieure ici (« sous tenant, cela ne fuit pas, géométriquement »)
// était FAUSSE. Une fausse assurance écrite dans ce fichier est pire que le trou lui-même : elle
// dissuade le prochain de chercher. Ce qui est vrai :
//
//   - Sous SUPERADMIN, aucun `where` de racine n'existe (`assertTenantReadScope`, plus haut, ne
//     pose aucun filtre pour ce contexte — le super-admin n'a pas de tenant ambiant par lequel
//     borner). `Service.findMany({})` peut donc rendre des lignes de TOUS les établissements ;
//     chacune atteint SA PROPRE ligne globale via `establishment`, et cette ligne globale expose
//     à son tour SES propres patients/soignants/lieux/comptes — la liste nominative de tous les
//     établissements, en clair : « le super-admin compte, il ne lit pas » (SUPERADMIN_OPERATIONS)
//     perd son sens si une inclusion imbriquée peut quand même faire lire. C'est le cas que cette
//     fonction ferme, et elle le ferme dans les DEUX sens (voir la condition ci-dessous) : un
//     modèle global rencontré comme CIBLE d'une relation (`Service.establishment`) ou comme
//     PORTEUR d'une relation vers du tenant (`Establishment.patients`, y compris depuis la racine
//     elle-même) est également refusé — pas seulement l'un des deux sens.
//
//   - Sous TENANT, en revanche, **ce trou existe aussi, et cette fonction ne le ferme PAS** (elle
//     ne s'applique qu'à `store.kind === 'superadmin'`, voir la condition). La prémisse qui
//     laissait croire le contraire était à moitié vraie : les relations MENANT à un modèle global
//     depuis un modèle de tenant sont bien toutes à-un (vérifié dans MODEL_RELATIONS). Mais un
//     modèle global peut ensuite exposer une relation à-PLUSIEURS qui traverse plusieurs
//     établissements — `User.establishmentMemberships` en est une, et un même utilisateur peut
//     appartenir à plusieurs établissements. Exemple démontré, refusé nulle part aujourd'hui :
//
//       establishmentMembership.findMany({ where: { establishmentId: 'e1' },
//         include: { user: { include: { establishmentMemberships: {
//           include: { establishment: { include: { patients: true } } } } } } } })
//
//     Ce trou est ANTÉRIEUR à cette tâche (vérifié : le verdict est identique avant et après —
//     voir la preuve de monotonie, tenant-guard.test.ts) ; cette tâche ne l'ouvre pas et, à dessein,
//     ne le ferme pas non plus — le fermer pour de bon exige de suivre la CARDINALITÉ de chaque
//     relation (à-un / à-plusieurs) à travers tout le graphe, une information que MODEL_RELATIONS
//     ne porte pas aujourd'hui, et qui touche le chemin de TOUS les comptes, pas seulement le
//     super-admin. C'est une tâche à part (tâche 15).
//
// Remède retenu ici, LOCAL au contexte superadmin plutôt qu'une refonte de la descente pour tous
// les contextes : sous superadmin, franchir un modèle GLOBAL — dans un sens ou dans l'autre, à
// n'importe quelle profondeur, y compris depuis la racine — est refusé purement et simplement.
// Aucune valeur ne pourrait de toute façon border cette traversée (il n'existe pas de « bon »
// établissement à comparer, comme il n'en existe pas pour assertWhere). Un futur usage d'un
// modèle global sous superadmin (déclaration future dans SUPERADMIN_OPERATIONS) devra être
// pensé en connaissance de cette limite, pas la contourner par un ajout à ce fichier.
const assertNoGlobalBridgeUnderSuperAdmin = (
  model: string,
  childModel: string,
  operation: string,
  relationField: string,
  store: TenantStore | undefined,
): void => {
  if (store?.kind !== 'superadmin') {
    return
  }
  if (familyOf(model) !== 'global' && familyOf(childModel) !== 'global') {
    return
  }
  throw new TenantScopeMissingError(
    model,
    operation,
    `relation '${relationField}' franchit un modèle global (${model} <-> ${childModel}) — refusée sous superadmin, qui n'a pas de tenant ambiant pour borner ce que ce pont exposerait`,
  )
}

// Traite une relation d'include/select une fois son modèle cible résolu, commun à `include` et
// `select` : sépare ce cas partagé du reste pour garder assertNestedInclude lisible (extrait
// aussi pour la complexité cognitive du linter, qui compte les deux boucles ensemble sinon).
// Vérifie la transition établissement → service si elle s'applique ICI, refuse le pont vers un
// modèle global sous superadmin (voir assertNoGlobalBridgeUnderSuperAdmin ci-dessus), puis
// redescend récursivement — quelle que soit cette famille, jamais seulement si elle correspond.
const assertNestedIncludeEntry = (
  model: string,
  childModel: string,
  operation: string,
  relationField: string,
  value: unknown,
  store: TenantStore | undefined,
): void => {
  if (familyOf(model) === 'establishment' && familyOf(childModel) === 'service') {
    assertServiceRelationFilter(model, operation, relationField, value, store)
  }
  assertNoGlobalBridgeUnderSuperAdmin(model, childModel, operation, relationField, store)
  if (isDict(value)) {
    assertNestedInclude(childModel, `${operation}>${relationField}`, value, store)
  }
}

const assertNestedInclude = (model: string, operation: string, args: Dict, store: TenantStore | undefined): void => {
  const relations = MODEL_RELATIONS[model] ?? {}
  // `include` n'accepte que des relations : toute clé doit donc être déclarée. Une clé inconnue
  // est refusée plutôt que laissée sans contrôle — y compris `_count`, qui compte des enfants
  // sans les filtrer.
  for (const [relationField, value] of includedRelationEntries(args.include)) {
    const childModel = relations[relationField]
    if (!childModel) {
      throw new TenantScopeMissingError(
        model,
        operation,
        `relation '${relationField}' non déclarée — l'ajouter à MODEL_RELATIONS['${model}']`,
      )
    }
    assertNestedIncludeEntry(model, childModel, operation, relationField, value, store)
  }
  // `select` mêle colonnes scalaires et relations, et rien ne permet ici de les distinguer : on
  // n'y exige donc pas la déclaration, seules les relations déclarées y sont vérifiées — mais
  // celles-ci suivent la même récursion que sous `include`. `_count` est le seul cas qui n'est ni
  // l'un ni l'autre (mot réservé Prisma, jamais un nom de champ ou de relation de ce schéma) : il
  // est refusé explicitement, comme il l'est déjà sous `include` (où il tombe simplement dans le
  // cas « clé non déclarée » ci-dessus) — sinon il compterait les enfants de tous les services
  // sans jamais être vu, une fuite de cardinalité plutôt que de contenu.
  for (const [relationField, value] of includedRelationEntries(args.select)) {
    if (relationField === '_count') {
      throw new TenantScopeMissingError(
        model,
        operation,
        "'_count' compte des enfants sans les filtrer, refusé sous select comme sous include",
      )
    }
    const childModel = relations[relationField]
    if (!childModel) {
      continue
    }
    assertNestedIncludeEntry(model, childModel, operation, relationField, value, store)
  }
}

// Descend dans les relations imbriquées d'un `data` de mise à jour (update / updateMany /
// updateManyAndReturn, ou la branche `update` d'un upsert), avec les mêmes règles que pour une
// création : relation non déclarée refusée, create/createMany/connectOrCreate/connect/set
// vérifiés. Ne vérifie PAS les colonnes de tenant de `data` lui-même — un `data` de mise à jour
// n'en porte normalement aucune, et le cas où il en porte une est déjà couvert par
// assertNoTenantMove.
const assertNestedRelationsInUpdate = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  if (isDict(data)) {
    assertNestedRelations(model, operation, data, store)
  }
}

// Charge d'une mise à jour, au premier niveau comme imbriquée : ses colonnes de tenant ne
// doivent pas déplacer la ligne, et ses relations imbriquées suivent les mêmes règles que sous
// un create. Déclarée après `assertNestedWrite`, qui l'appelle : les deux sont mutuellement
// récursives (assertNestedWrite → assertUpdatePayload → assertNestedRelations →
// assertNestedWrite), comme `assertData` l'est déjà. La récursion n'a lieu qu'à l'appel, jamais
// à l'initialisation du module.
function assertUpdatePayload(model: string, operation: string, data: unknown, store: TenantStore): void {
  assertNoTenantMove(model, operation, data, store)
  assertNestedRelationsInUpdate(model, operation, data, store)
}

// Vérifie une lecture depuis un modèle global (`User`, `Establishment`) : sûreté au premier
// niveau (assertGlobalInclude, une seule ligne) PUIS descente récursive (assertNestedInclude),
// comme pour une racine de service ou d'établissement. Extraite pour la complexité cognitive du
// linter, qui compte les deux branches de assertTenantScope ensemble sinon — voir
// assertNestedIncludeEntry, extraite pour la même raison.
//
// Une racine globale peut être lue SANS tenant en contexte (ex. la connexion, avant
// tenantContext.clear()), donc `store` reste `TenantStore | undefined` jusqu'ici — voir
// assertServiceRelationFilter, qui refuse plutôt que de laisser passer par défaut quand il n'y a
// aucun store à comparer. Bypassée en mode système comme le reste du garde-fou.
//
// TOUR DE CORRECTION 3 (tâche 1) — sous superadmin, une opération sur une table globale doit être
// déclarée pour passer, et elle l'est ici, avant même assertGlobalInclude : rien dans ce fichier
// ne borne une écriture sur un modèle global (pas de colonne de tenant à comparer), donc rien ne
// s'opposait à `Establishment.deleteMany({})`.
//
// TOUR DE CORRECTION 4 — la déclaration est devenue une table PAR MODÈLE
// (SUPERADMIN_GLOBAL_OPERATIONS, plus haut, où chaque entrée est justifiée une par une) plutôt
// qu'un ensemble d'opérations valable pour tous les modèles globaux à la fois.
const assertSuperAdminGlobalOperationDeclared = (model: string, operation: string): void => {
  const permises = SUPERADMIN_GLOBAL_OPERATIONS[model]
  if (!permises?.includes(operation)) {
    throw new TenantScopeMissingError(model, operation, 'superadmin')
  }
}

// Une écriture déclarée sur un modèle global n'ouvre QUE sa propre ligne. Son `data` peut porter
// une écriture imbriquée (`Establishment.create({ data: { patients: { create: … } } })`), et
// `assertGlobalScope` n'inspectait jusqu'ici que `include`/`select`, jamais `data` — il n'en avait
// pas besoin tant que toute écriture globale était refusée. Maintenant qu'elles peuvent être
// déclarées, la même récursion que pour une racine de tenant s'applique : `assertSuperAdminWriteRow`
// (donc `assertNestedRelations`) refuse toute relation absente de NESTED_RELATIONS — et aucun
// modèle global n'y a d'entrée, donc toute écriture imbriquée depuis une racine globale est
// refusée. Sans cet appel, déclarer `Establishment.create` rouvrirait, par son `data`, le pont vers
// les modèles de tenant que assertNoGlobalBridgeUnderSuperAdmin ferme du côté `include`.
const assertSuperAdminGlobalWrite = (model: string, operation: string, args: Dict, store: TenantStore): void => {
  if (WRITE_OPERATIONS.has(operation)) {
    assertSuperAdminWriteRow(model, operation, operation === 'upsert' ? args.create : args.data, store)
  }
  if (UPDATE_OPERATIONS.has(operation)) {
    assertSuperAdminWriteRow(model, operation, args.data, store)
  }
  if (operation === 'upsert') {
    assertSuperAdminWriteRow(model, `${operation}.update`, args.update, store)
  }
}

const assertGlobalScope = (model: string, operation: string, args: Dict, store: TenantStore | undefined): void => {
  if (store?.kind === 'superadmin') {
    assertSuperAdminGlobalOperationDeclared(model, operation)
    assertSuperAdminGlobalWrite(model, operation, args, store)
  }
  assertGlobalInclude(model, operation, args)
  if (store?.kind !== 'system') {
    assertNestedInclude(model, operation, args, store)
  }
}

// Porte de permission du contexte superadmin : le couple (modèle, opération) doit figurer dans
// SUPERADMIN_OPERATIONS, exhaustive par construction (tout couple absent est refusé).
//
// TOUR DE CORRECTION 1 (tâche 1) — Critique 1 de la revue : cette porte ne fait PLUS sortir de
// assertTenantScope. La première version faisait `return` juste après elle, ce qui sautait toute
// la descente structurelle prouvée à l'étape 3 (assertNestedInclude, assertData →
// assertNestedRelations) : un `Service.findMany` déclaré, complété d'un `include` imbriqué
// jusqu'à `Patient` via `patientServiceFiles`, passait — l'accès aux colonnes cliniques que la
// liste déclarée est censée exclure. Cette porte se contente donc maintenant de vérifier la
// permission puis de laisser l'exécution retomber dans le même corps que le contexte tenant, plus
// bas dans cette fonction — « la machinerie existe déjà et rend le bon verdict, il manquait
// l'appel ». Les seuls endroits qui divergent encore du contexte tenant sont gardés par
// `store.kind === 'tenant'`, à l'endroit précis où ils comparent une valeur à UN tenant ambiant
// que le superadmin n'a pas (voir le commentaire de assertData ci-dessus pour l'écriture, et
// la garde équivalente sur la lecture ci-dessous) — la descente structurelle, elle, s'applique
// aux deux contextes sans distinction.
const assertSuperAdminOperationDeclared = (model: string, operation: string): void => {
  const permises = SUPERADMIN_OPERATIONS[model]
  if (!permises?.includes(operation)) {
    throw new TenantScopeMissingError(model, operation, 'superadmin')
  }
}

// `assertWhere` compare le `where` à UN tenant ambiant : sans objet sous superadmin (même raison
// que assertData, plus haut), donc réservé au contexte tenant plutôt que refusé partout — ce qui
// aurait rendu la liste déclarée inutilisable en lecture, contrairement aux exemples du brief
// (`Service.count`/`Patient.count` avec un `where` explicite, mais libre). Extraite avec sa garde
// pour la complexité cognitive de assertTenantScope, comme les fonctions voisines.
const assertTenantReadScope = (
  model: string,
  operation: string,
  args: Dict,
  field: string,
  store: TenantStore,
): void => {
  if (store.kind !== 'tenant') {
    return
  }
  assertWhere(model, operation, args, field, store)
  if (UPDATE_OPERATIONS.has(operation)) {
    assertUpdatePayload(model, operation, args.data, store)
  }
}

// Même garde que ci-dessus, pour la branche `update` d'un upsert.
const assertTenantUpsertPayload = (model: string, operation: string, args: Dict, store: TenantStore): void => {
  if (store.kind === 'tenant') {
    assertUpdatePayload(model, `${operation}.update`, args.update, store)
  }
}

// Vérifie qu'une opération Prisma porte le filtre de tenant attendu.
// Pure : testable sans client Prisma.
export const assertTenantScope = (
  input: { model: string; operation: string; args: Dict },
  store: TenantStore | undefined,
): void => {
  const { model, operation, args } = input
  const family = familyOf(model)
  if (family === 'global') {
    assertGlobalScope(model, operation, args, store)
    return
  }
  if (!store) {
    throw new TenantScopeMissingError(model, operation, 'context')
  }
  if (store.kind === 'system') {
    return
  }
  if (store.kind === 'superadmin') {
    assertSuperAdminOperationDeclared(model, operation)
  }
  const isRead = READ_OPERATIONS.has(operation)
  const isWrite = WRITE_OPERATIONS.has(operation)
  // Une opération qui n'appartient à aucun des deux ensembles connus est refusée : mieux vaut
  // bloquer une opération légitime que laisser filer une opération future non vérifiée.
  if (!isRead && !isWrite) {
    throw new TenantScopeMissingError(model, operation, 'operation')
  }
  // Vaut pour les lectures comme pour les écritures, et pour tenant comme pour superadmin : un
  // `create ... include` renvoie les mêmes données qu'un `findMany ... include`, et expose donc
  // la même chose. Appelé pour une racine de service ou d'établissement (pas seulement
  // d'établissement, depuis la tâche 9) : la transition établissement → service que cette
  // fonction referme peut se trouver n'importe où dans l'arbre d'inclusion, y compris sous une
  // racine de service qui n'atteint un modèle d'établissement qu'en profondeur (voir
  // assertNestedInclude). Sous superadmin, cette transition est TOUJOURS refusée
  // (assertServiceRelationFilter n'a de valeur à comparer que pour un store `tenant` — voir son
  // commentaire), ce qui est le comportement voulu : le superadmin n'a pas de service courant.
  if (family === 'establishment' || family === 'service') {
    assertNestedInclude(model, operation, args, store)
  }
  const field = family === 'service' ? 'serviceId' : 'establishmentId'
  if (isRead) {
    assertTenantReadScope(model, operation, args, field, store)
  }
  if (isWrite) {
    const data = operation === 'upsert' ? args.create : args.data
    assertWriteData(model, operation, data, store)
  }
  if (operation === 'upsert') {
    assertTenantUpsertPayload(model, operation, args, store)
  }
}

export const buildTenantGuardExtension = (tenantContext: TenantContextInterface) =>
  Prisma.defineExtension({
    name: 'tenantGuard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          assertTenantScope(
            { model, operation, args: args as Dict },
            tenantContext.peek(),
          )
          return query(args)
        },
      },
    },
  })

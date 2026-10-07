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
  'PatientAccessLog',
  // Modeles de service depuis le 2026-09-29 (un soignant est un metier du service, une salle un
  // lieu du service) : voir la migration `soignants_salles_par_service`.
  'Soignant',
  'Location',
]

// Modèles rattachés à un établissement : portent establishmentId.
export const ESTABLISHMENT_MODELS: readonly string[] = [
  'Patient',
  'Service',
  'EstablishmentMembership',
  'ServiceMembership',
  'ActivityLog',
]

// Le contexte `superadmin` n'est PAS `system`. `system` retire l'exigence de filtre pour toute
// opération ; l'invariant n'est PAS un nombre d'appels (qui grossit avec le temps) mais DEUX
// propriétés distinctes, gardées par DEUX tests distincts : un `where` vide sur les deux emplois
// déclarés de `patientServiceFile.repository.ts` laisserait le premier test 3 sur 3 vert :
//   - que chaque emploi soit DÉCLARÉ, nommé, avec sa raison — `runAsSystem-unicite.test.ts`, qui
//     ne regarde jamais le contenu d'une requête, seulement OÙ (quel fichier) la capacité est
//     invoquée ;
//   - que la requête que chaque emploi encadre porte SES PROPRES BORNES explicites — vérifié au
//     cas par cas, par emploi, dans `repository-scope.test.ts` (capture des arguments réels
//     envoyés à Prisma, puis preuve que cette forme serait refusée hors du mode encadré).
// Ici, la liste ci-dessous est exhaustive : tout couple (modèle, opération) absent est refusé
// comme sans contexte. Le super-admin compte, il ne lit pas — d'où l'absence de `findMany` sur
// `Patient`.
//
// CE QUE CETTE LISTE REFUSE, ET LE CONTOURNEMENT SÛR — lisez ceci AVANT d'ajouter une entrée ici
// pour contourner un refus. `assertNoGlobalBridgeUnderSuperAdmin` (plus bas dans ce fichier)
// refuse, sous superadmin, toute relation imbriquée qui franchit un modèle GLOBAL (`User`,
// `Establishment`) — dans un sens comme dans l'autre. Concrètement, sont refusés :
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
// CÔTÉ ÉCRITURE, ce que le paragraphe ci-dessus ne disait pas : une
// écriture sur un modèle GLOBAL sous superadmin — créer un établissement, un compte, un lien
// d'accès, un octroi — ne se déclare pas ici non plus, mais dans SUPERADMIN_GLOBAL_OPERATIONS.
// Elle n'ouvre que sa propre ligne : toute écriture IMBRIQUÉE sous son `data` (un
// `patients: { create: … }` accroché à un `Establishment.create`) reste refusée, comme l'est
// l'`include` équivalent. Pour rattacher une ligne de tenant à la ligne globale qu'on vient de
// créer, il faut donc une seconde écriture, déclarée dans CETTE liste-ci
// (`EstablishmentMembership.create`), et non une écriture imbriquée.
export const SUPERADMIN_OPERATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  Service: ['count', 'findMany'],
  EstablishmentMembership: ['count', 'findMany', 'create'],
  ServiceMembership: ['count', 'findMany'],
  Patient: ['count'],
  ActivityLog: ['findMany', 'count'],
  // `GET /super-admin/access-log` (source=acces). Jamais une ligne de
  // `Patient` — cette entrée ne rouvre pas « le super-admin compte, il ne lit pas » (voir
  // `Patient` ci-dessus) : `PatientAccessLog` est le journal d'AUDIT, jamais le dossier lui-même,
  // et sa réponse HTTP ne porte que `patientId` comme IDENTIFIANT (jamais un nom) — voir
  // `superAdminAccessLog.schema.ts`.
  //
  // `count` A ÉTÉ RETIRÉ, puis RE-DÉCLARÉ le 2026-10-01 — et la séquence entière compte, pas
  // seulement son état final. Il était d'abord là « par symétrie » avec `ActivityLog` juste
  // au-dessus, sans qu'aucun appel ne l'exerce : la discipline écrite en toutes lettres au-dessus
  // de `NO_CONTEXT_GLOBAL_OPERATIONS` (« chaque entrée porte la route qui la justifie ; une entrée
  // sans route est une entrée à supprimer ») le condamnait, et l'a condamné. Il revient parce que
  // la pagination de `GET /super-admin/access-log` lui donne enfin cette route :
  // `PatientAccessLogRepository.findAllPlatformWide` compte désormais le même `where` hors page,
  // sans quoi la dernière page n'est pas atteignable. Retirer cette entrée ne rend PAS un total de
  // zéro — la table échoue fermé, donc la route répond 500 (vérifié par sabotage : les vingt cas
  // `source=acces` de `super-admin-access-log.test.ts` passent en 500).
  PatientAccessLog: ['findMany', 'count'],
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
  Soignant: {
    slotTemplateLinks: 'SlotTemplateSoignant',
    thematicLinks: 'SoignantThematic',
  },
  EstablishmentMembership: { serviceMemberships: 'ServiceMembership' },
  Patient: {
    appointmentPatients: 'AppointmentPatient',
    serviceFiles: 'PatientServiceFile',
  },
}

// Relations d'un modèle global qui exposent des données de tenant. Un include/select dessus n'est
// laissé passer que sur une opération ciblant une seule ligne (findUnique(OrThrow)).
//
// CE QUE CE MOTIF NE GARANTIT PAS : on pourrait croire qu'une opération à une seule ligne
// garantit un seul tenant, mais c'est FAUX. Une opération à une seule ligne garantit une seule
// ligne PARENTE, jamais un seul tenant : toutes les relations listées ci-dessous sont à-PLUSIEURS,
// donc une seule ligne de `User` porte les appartenances de TOUS ses établissements, et une seule
// ligne d'`Establishment` porte tous SES patients — sans que rien n'oblige cette ligne à être
// celle du tenant courant, un modèle global n'ayant aucune colonne de tenant à comparer.
//
// CE QUI RESTE À CETTE TABLE, et pourquoi elle n'est pas supprimée : sous
// `tenant` et sous `superadmin`, `assertNoGlobalToManyBridge` (plus bas) refuse désormais ces
// relations quelle que soit l'opération, findUnique compris — cette table-ci n'y ajoute plus
// rien. Elle reste la seule règle de DESCENTE en charge du cas sans contexte, c'est-à-dire de
// TOUTE route non tenant (`/auth`, `/me`, tout `/super-admin` — voir assertNoGlobalToManyBridge
// pour pourquoi la liste est aussi large), où la règle de cardinalité ne s'applique pas : elle y
// interdit encore un `findMany` qui ramènerait ces enfants pour plusieurs comptes ou plusieurs
// établissements à la fois, mais elle laisse passer le `findUnique` — dont ce commentaire vient
// d'établir qu'il ne garantit rien. C'est une borne FAIBLE, et elle est nommée comme telle
// plutôt que présentée comme une garantie.
//
// Elle n'est plus SEULE sur ce cas, mais ce qui s'ajoute est d'une autre
// nature. NO_CONTEXT_GLOBAL_OPERATIONS (plus bas) décide désormais QUELLES opérations peuvent
// s'exécuter sans contexte sur un modèle global ; cette table-ci décide de ce qu'une opération
// admise peut INCLURE. Les deux se composent, aucune ne remplace l'autre : `Establishment.
// findMany` est déclaré, et c'est bien cette table-ci qui l'empêche d'y accrocher `patients`.
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
// `User.soignant` disparu, le lien vers `Soignant` étant passé à
// `EstablishmentMembership`.)
//
// `User` et `Establishment` ne sont ni dans SERVICE_MODELS ni dans ESTABLISHMENT_MODELS : ce sont
// des modèles globaux. Toutes leurs relations vers un modèle de TENANT sont listées ci-dessous ;
// ils portent aussi chacun une relation vers un autre modèle global (`User.accessLinks` ->
// `AccessLink`, `User.superAdminAccessGrants` et
// `Establishment.superAdminAccessGrants` -> `SuperAdminAccessGrant`) qui n'a donc pas sa place
// ici : voir `tenant-guard-schema.test.ts` (SANS_DONNEE_DE_TENANT) pour l'énoncé de ce choix.
export const GLOBAL_TENANT_RELATIONS: Record<string, readonly string[]> = {
  User: ['establishmentMemberships'],
  Establishment: ['services', 'memberships', 'patients'],
}

// Une relation de MODEL_RELATIONS : sa cible ET sa CARDINALITÉ.
//
// POURQUOI LA CARDINALITÉ Y ENTRE. La protection du chemin de tenant ordinaire repose sur le
// `where` de la RACINE, qui épingle l'établissement.
// Descendre depuis une ligne déjà épinglée est sûr tant que chaque saut reste borné par elle —
// et les relations qui MÈNENT à un modèle global le sont toutes, parce qu'elles sont toutes
// à-un : `EstablishmentMembership.user`, `Patient.establishment`, `AccessLink.user`… une ligne
// de tenant ne mène jamais qu'à UNE ligne globale, celle qui lui correspond. Mais une relation
// qui REPART d'un modèle global peut être à-PLUSIEURS, et celle-là n'est plus bornée par rien :
// `User.establishmentMemberships` rend les appartenances de TOUS les établissements du compte,
// `Establishment.patients` les patients de l'établissement visé quel qu'il soit. C'est cette
// ASYMÉTRIE qu'une simple descente récursive sans information de cardinalité ne peut pas voir,
// faute de savoir distinguer les deux sens — voir assertNoGlobalToManyBridge.
//
// `one` / `many` plutôt qu'un booléen nu (`{ model, list: true }` écrit 68 fois) : à la lecture
// d'un diff, c'est le mot qui doit changer quand une relation change de nature, pas un `true`
// perdu en fin de ligne. Le test de conformité au schéma tient la cardinalité DANS LES DEUX SENS
// (tenant-guard-schema.test.ts) : une relation qui passe de `Type` à `Type[]` dans
// prisma/schema.prisma, ou l'inverse, fait rougir tant qu'elle n'est pas répercutée ici.
export type ModelRelation = { readonly model: string; readonly list: boolean }
const one = (model: string): ModelRelation => ({ model, list: false })
const many = (model: string): ModelRelation => ({ model, list: true })

// Relations de TOUS les modèles du schéma (parent → champ → modèle cible), pas seulement ceux
// d'établissement. Noms repris un par un de prisma/schema.prisma : toute relation ajoutée
// là-bas doit l'être ici. La table est exhaustive et c'est une liste blanche : un `include` sur
// une relation absente d'ici est refusé (voir assertNestedInclude) plutôt que laissé sans
// contrôle — y compris pour un modèle qui n'aurait aucune relation déclarée (`ActivityLog`,
// `ForbiddenWeek`, `PlanningCycle` : entrée `{}`, donc toute clé y est absente).
//
// DÉCISION DE CONCEPTION — cette table était TENANT_CHILD_RELATIONS,
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
// service ramène sinon les enfants de TOUS les services. C'est exactement la fuite trouvée
// initialement (un patient remontait les problèmes d'inscription de tous les services), d'abord
// corrigée repository par repository, puis au premier niveau seulement par cette table,
// et maintenant à n'importe quelle profondeur d'inclusion imbriquée.
//
// Exportée pour `tenant-guard-schema.test.ts`, qui relit prisma/schema.prisma et échoue si une
// relation y a été ajoutée, renommée ou supprimée sans être répercutée ici. C'est ce test qui
// garantit l'exhaustivité de la table, et donc que le contrôle du `select` ci-dessous — qui ne
// peut pas, lui, exiger la déclaration — ne laisse rien passer.
export const MODEL_RELATIONS: Record<string, Record<string, ModelRelation>> = {
  // Modèles globaux.
  User: {
    establishmentMemberships: many('EstablishmentMembership'),
    accessLinks: many('AccessLink'),
    superAdminAccessGrants: many('SuperAdminAccessGrant'),
  },
  Establishment: {
    services: many('Service'),
    memberships: many('EstablishmentMembership'),
    patients: many('Patient'),
    superAdminAccessGrants: many('SuperAdminAccessGrant'),
  },
  // `AccessLink` et `SuperAdminAccessGrant` sont globaux eux aussi (voir
  // SUPERADMIN_GLOBAL_OPERATIONS plus bas) — leurs relations pointent vers d'autres modèles
  // globaux (`User`, `Establishment`), jamais vers du tenant.
  AccessLink: {
    user: one('User'),
  },
  SuperAdminAccessGrant: {
    user: one('User'),
    establishment: one('Establishment'),
  },
  // Modèles d'établissement.
  Patient: {
    establishment: one('Establishment'),
    appointmentPatients: many('AppointmentPatient'),
    pathwayPriorities: many('PatientPathwayPriority'),
    serviceFiles: many('PatientServiceFile'),
    accessLogs: many('PatientAccessLog'),
  },
  Service: {
    establishment: one('Establishment'),
    memberships: many('ServiceMembership'),
    patientServiceFiles: many('PatientServiceFile'),
    accessLogs: many('PatientAccessLog'),
  },
  EstablishmentMembership: {
    user: one('User'),
    establishment: one('Establishment'),
    serviceMemberships: many('ServiceMembership'),
  },
  ServiceMembership: {
    establishmentMembership: one('EstablishmentMembership'),
    service: one('Service'),
    soignant: one('Soignant'),
  },
  // `ActivityLog` ne déclare aucune relation dans le schéma : tout include y est donc refusé.
  ActivityLog: {},
  // Modèles de service.
  PathwayTemplate: {
    pathways: many('Pathway'),
    slotTemplates: many('SlotTemplate'),
  },
  SlotTemplate: {
    slot: one('Slot'),
    soignantLinks: many('SlotTemplateSoignant'),
    template: one('PathwayTemplate'),
    location: one('Location'),
    thematic: one('Thematic'),
  },
  Pathway: {
    template: one('PathwayTemplate'),
    slots: many('Slot'),
    patientPriorities: many('PatientPathwayPriority'),
  },
  Slot: {
    appointments: many('Appointment'),
    pathway: one('Pathway'),
    slotTemplate: one('SlotTemplate'),
  },
  Appointment: {
    appointmentPatients: many('AppointmentPatient'),
    slot: one('Slot'),
    thematic: one('Thematic'),
  },
  AppointmentPatient: {
    appointment: one('Appointment'),
    patient: one('Patient'),
  },
  Thematic: {
    soignantLinks: many('SoignantThematic'),
    appointments: many('Appointment'),
    slotTemplates: many('SlotTemplate'),
  },
  DiagnosticEducatifTemplate: {
    diagnostics: many('DiagnosticEducatif'),
  },
  DiagnosticEducatif: {
    template: one('DiagnosticEducatifTemplate'),
    serviceFile: one('PatientServiceFile'),
  },
  EnrollmentIssue: {
    serviceFile: one('PatientServiceFile'),
  },
  PatientPathwayPriority: {
    patient: one('Patient'),
    pathway: one('Pathway'),
  },
  // `ForbiddenWeek` et `PlanningCycle` ne déclarent aucune relation dans le schéma.
  ForbiddenWeek: {},
  PlanningCycle: {},
  Todo: {
    soignant: one('Soignant'),
  },
  Soignant: {
    slotTemplateLinks: many('SlotTemplateSoignant'),
    thematicLinks: many('SoignantThematic'),
    todos: many('Todo'),
    serviceMemberships: many('ServiceMembership'),
  },
  Location: {
    slotTemplates: many('SlotTemplate'),
  },
  SlotTemplateSoignant: {
    slotTemplate: one('SlotTemplate'),
    soignant: one('Soignant'),
  },
  SoignantThematic: {
    soignant: one('Soignant'),
    thematic: one('Thematic'),
  },
  PatientServiceFile: {
    patient: one('Patient'),
    service: one('Service'),
    diagnostics: many('DiagnosticEducatif'),
    enrollmentIssues: many('EnrollmentIssue'),
  },
  PatientAccessLog: {
    patient: one('Patient'),
    service: one('Service'),
  },
}

const UNIQUE_READ_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow'])

const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
  'count',
  'aggregate',
  'groupBy',
])
const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
])
// Sous-ensemble des opérations de lecture dont le `data` peut déplacer une ligne d'un tenant à
// l'autre (voir assertNoTenantMove). Le `update` d'un upsert est traité séparément : sa clé
// (args.update) ne coïncide pas avec args.data.
const UPDATE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
])

// UNE RACINE GLOBALE CONTOURNE ENTIÈREMENT SUPERADMIN_OPERATIONS. `assertTenantScope` retourne
// via `assertGlobalScope` dès que `family === 'global'`, AVANT même d'atteindre la porte de
// permission (`assertSuperAdminOperationDeclared`, plus bas) — un modèle global ne franchit tout
// simplement jamais cette porte. Démontré : `Establishment.deleteMany({})` (aucune colonne de
// tenant à vérifier sur un modèle global, donc rien ne s'y opposait) purgeait la table entière.
//
// POURQUOI LA GRANULARITÉ EST PAR MODÈLE, ET PAS PAR UN SIMPLE ENSEMBLE D'OPÉRATIONS. Un
// ensemble d'OPÉRATIONS sans distinction de modèle (lecture permise, toute mutation refusée)
// fermerait TROP, et sans laisser de porte : un modèle global n'atteint JAMAIS
// `assertSuperAdminOperationDeclared` (le retour par `assertGlobalScope` a lieu avant), donc
// l'ajouter à SUPERADMIN_OPERATIONS n'aurait rien changé ; et assouplir l'ensemble global
// aurait rouvert `Establishment.create` pour n'importe quoi, ou `Establishment.deleteMany({})`.
// Le reste du fichier a partout ailleurs la granularité PAR MODÈLE ; cette table la lui applique
// aussi.
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
//   - `User.create` : premier administrateur d'un établissement, et compte de membre. PAS
//     `upsert` : une adresse déjà connue ne doit être NI écrasée ni distinguable dans
//     la réponse, donc une lecture suivie d'une création, jamais un upsert qui écraserait le nom
//     ou le mot de passe. PAS `update` : `lastLoginAt` est posé sur le chemin de
//     connexion, qui n'a aucun contexte, et la désactivation d'un membre se fait
//     sous contexte tenant, où un modèle global n'est pas soumis à cette table.
//   - `Establishment.create`, `update` : `PATCH /super-admin/establishments/:id`
//     (renommer) — son `data` ne porte que `name`, toute écriture imbriquée restant refusée. PAS
//     `updateMany`/`upsert`/`delete(Many)` : aucune route ne s'en sert sous ce contexte.
//   - `AccessLink.create` + `updateMany` : émettre un lien, et invalider les
//     liens précédents du même compte à la réémission (`updateMany` conditionné sur
//     `usedAt: null`).
//   - `SuperAdminAccessGrant.create` + `update`. PAS `delete` : le modèle porte
//     `revokedAt DateTime?` (spécification §5) et `GET /e/:establishmentId/grants` doit rendre
//     les octrois « en cours ET PASSÉS, avec leur motif
//     et leur auteur ». Supprimer la ligne détruirait précisément la trace comptable qui justifie
//     le mécanisme : révoquer est un `update` qui pose `revokedAt`, pas un `delete`. PAS
//     `deleteMany` non plus, pour la même raison.
//
// `AccessLink` et `SuperAdminAccessGrant` sont déclarés ici à dessein : ce sont des modèles
// GLOBAUX (« Ne les ajoute ni à SERVICE_MODELS ni à ESTABLISHMENT_MODELS ») et `familyOf` rend
// « global » par défaut pour tout modèle qu'il ne connaît pas. Les opérations ci-dessous ont été
// relues contre les modèles réels (`usedAt`/`revokedAt` confirmés).
//
// AJOUTER UN MODÈLE GLOBAL AU SCHÉMA SANS ENTRÉE ICI ne l'ouvre pas : il est refusé en entier sous
// superadmin (échec FERMÉ), et le refus dit quel couple manque.
const LECTURES_GLOBALES_SANS_MUTATION: readonly string[] = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]

export const SUPERADMIN_GLOBAL_OPERATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  User: [...LECTURES_GLOBALES_SANS_MUTATION, 'create'],
  Establishment: [...LECTURES_GLOBALES_SANS_MUTATION, 'create', 'update'],
  AccessLink: [...LECTURES_GLOBALES_SANS_MUTATION, 'create', 'updateMany'],
  SuperAdminAccessGrant: [
    ...LECTURES_GLOBALES_SANS_MUTATION,
    'create',
    'update',
  ],
}

// L'ABSENCE DE CONTEXTE EST UN QUATRIÈME CONTEXTE DÉCLARÉ, plus un
// laissez-passer. Symétrique exacte de SUPERADMIN_GLOBAL_OPERATIONS ci-dessus, pour le cas
// `store === undefined` : un couple (modèle, opération) absent est refusé, et un modèle global
// absent de la table l'est en entier, lecture comprise.
//
// LE DÉFAUT QUE CETTE TABLE FERME, ET SA PORTÉE EXACTE. `routes/index.ts` appelle
// `tenantContext.clear()` en tête de CHAQUE requête et `tenant.plugin.ts` est le SEUL à appeler
// `enter()` : `/auth`, `/me` et TOUT le préfixe `/super-admin` s'exécutent donc sans store,
// leurs dépôts n'entrant dans `runAsSuperAdmin` qu'au coup par coup. Pour un modèle de TENANT ce
// cas était DÉJÀ refusé (`assertTenantScope` lève dès que `!store`, avant toute autre
// vérification) ; le trou ne concernait que les modèles GLOBAUX, qui sortent par
// `assertGlobalScope` sans jamais rencontrer de porte de permission. Mesuré :
// `Establishment.findUnique({ include: { patients:
// true } })`, `Establishment.deleteMany({})` et `User.updateMany({ data: { isSuperAdmin: true }
// } )` passaient. C'était le trou le plus large du cas SANS CONTEXTE — mais pas le trou le plus
// large dans l'absolu : le même trou reste OUVERT, et plus large, sous un contexte de TENANT
// ordinaire — `Establishment.deleteMany({})` et `User.updateMany({ data: { isSuperAdmin: true }
// })` y passent toujours, faute de colonne de tenant à comparer sur un modèle global. Le
// contexte tenant n'a toujours pas de table équivalente ; voir assertGlobalNestedWrite, qui le
// dit aussi.
//
// COMMENT CETTE LISTE A ÉTÉ ÉTABLIE — pas en lisant le code, en MESURANT. Le garde-fou a été
// instrumenté (journalisation de chaque couple (modèle, opération) vu avec `peek() ===
// undefined`, dans `buildTenantGuardExtension`, donc sur les seuls appels Prisma RÉELS) puis la
// suite e2e complète a été lancée : 1 243 appels, 8 couples distincts, tous sur un modèle global
// (aucun modèle de tenant n'apparaît — confirmation par la mesure que ce cas-là était bien déjà
// fermé). La suite unitaire, relancée de même, n'en produit aucun : elle appelle
// `assertTenantScope` directement, sans client Prisma.
//
// LA MESURE A MANQUÉ UNE ENTRÉE, ET C'EST DIT ICI PLUTÔT QU'ENTERRÉ : `User.create` n'a été vu
// par AUCUN des 1 243 appels, parce qu'aucun test e2e n'exerçait `POST /auth/register` — la
// seule route non tenant qui crée un compte hors `runAsSuperAdmin`. Une liste purement
// journalisée aurait donc fermé cette route en production sans qu'un seul test rougisse. Le
// couple est déclaré ci-dessous, ET la route est désormais couverte par
// `src/test/e2e/auth-register.test.ts`, pour que la méthode de découverte redevienne complète :
// une prochaine relance de l'instrumentation le verrait.
//
// CE QUE CETTE TABLE NE FERME PAS — à lire avant de croire le cas « sans contexte » verrouillé :
//   1. Une opération DÉCLARÉE ici peut encore porter un `include` vers un modèle de tenant si
//      c'est une lecture à une seule ligne : `assertGlobalInclude` ne refuse que les lectures
//      à-plusieurs (findMany/findFirst) et `assertNoGlobalToManyBridge` ne s'applique pas sans
//      contexte. Ce n'est PAS un oubli : `UserRepository.findByID` fait exactement cela
//      (`user.findUniqueOrThrow` avec `include: { establishmentMemberships: … }`) sur le chemin
//      de la connexion et sur CHAQUE requête authentifiée (cookie.plugin.ts), pour ÉTABLIR à
//      quels établissements le compte appartient. Fermer ce cas fermerait la connexion. Ce qui
//      change avec cette table, c'est que la liste des opérations capables d'en arriver là est
//      maintenant close et nommée, au lieu d'être « toutes ».
//   2. Une écriture DÉCLARÉE ici n'est pas soumise à `assertGlobalNestedWrite` : un `data`
//      imbriqué sous `User.create` ou `AccessLink.create` reste non vérifié sans contexte, alors
//      qu'il l'est sous `tenant` et sous `superadmin`. C'est le pendant, côté écriture, du point
//      1 — nommé ici plutôt que découvert plus tard.
//   3. UNE ÉCRITURE DÉCLARÉE N'EST BORNÉE NI PAR LA LIGNE NI PAR LA COLONNE.
//      Cette table déclare des couples (modèle, opération) ; elle ne dit RIEN de ce que
//      l'écriture touche. Mesuré, sans contexte :
//        `User.update({ where: { id }, data: { isSuperAdmin: true } })`      -> PASSE
//        `User.update({ where: { id }, data: { deactivatedAt: … } })`        -> PASSE
//        `User.update({ data: { isSuperAdmin: true } })` (sans `where`)      -> PASSE
//        `AccessLink.updateMany({ where: {}, data: … })` (where vide)        -> PASSE
//        `User.updateMany({ where: {}, data: { isSuperAdmin: true } })`      -> refusé
//      Autrement dit : le défaut emblématique est bien fermé EN MASSE, et son jumeau
//      LIGNE À LIGNE ne l'est pas. Ce n'est pas exploitable aujourd'hui — vérifié route par
//      route, et c'est une propriété des APPELANTS, pas de cette table : `registerSchema` (Zod)
//      dépouille les clés inconnues du corps, et `PATCH /me` déstructure explicitement
//      `firstName`/`lastName` avant d'appeler `updateProfile`. Mais c'est à une ligne d'appel
//      près, et rien ici ne rattraperait cette ligne.
//      NE PAS LIRE « n'écrit que des colonnes scalaires » COMME UNE GARANTIE : `isSuperAdmin`
//      EST une colonne scalaire. Le point 2 parle des écritures IMBRIQUÉES (vers une autre
//      table) ; celui-ci parle des colonnes de la ligne globale elle-même, et les deux sont
//      ouverts pour des raisons différentes.
//      Fermer ce point-ci demanderait une table d'un autre genre — (modèle, opération, colonnes
//      permises) — que ni `SUPERADMIN_GLOBAL_OPERATIONS` ni celle-ci ne portent, donc un
//      arbitrage qui dépasse le périmètre de cette table. Le même trou existe, plus large, sous
//      contexte tenant (voir `assertGlobalNestedWrite`).
//
// CHAQUE ENTRÉE PORTE LA ROUTE QUI LA JUSTIFIE. Une entrée sans route est une entrée à
// supprimer.
export const NO_CONTEXT_GLOBAL_OPERATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  User: [
    // `AccessGrantRepository.findForUser` relit le drapeau `isSuperAdmin` HORS de
    // `runAsSuperAdmin`, à dessein (voir son commentaire) : `POST /auth/sign-in`, `GET /me`,
    // `PATCH /me`, `POST /auth/refresh`.
    'findUnique',
    // `UserRepository.findByID` / `.findIdentity` / `.findByEmail` : le crochet `onRequest` de
    // `routes/index.ts` (via `cookie.plugin.ts`, donc TOUTE requête authentifiée),
    // `POST /auth/sign-in`, `POST /auth/refresh`, `POST /auth/password-forgot`, `GET`/`PATCH /me`, `GET /super-admin/users`,
    // `POST /super-admin/establishments`, `POST /super-admin/users/:id/access-link`.
    'findUniqueOrThrow',
    // `UserRepository.recordLogin` (`POST /auth/sign-in`, pose `lastLoginAt`),
    // `.updatePassword` (`POST /auth/access-link/consume`), `.updateProfile` (`PATCH /me`).
    'update',
    // `UserRepository.create` depuis `AuthDomain.register` : `POST /auth/register`. Le seul
    // couple qu'aucun test e2e n'exerçait — voir le paragraphe ci-dessus.
    'create',
  ],
  Establishment: [
    // `EstablishmentRepository.findAll` (`GET /super-admin/establishments`) et `.findManyByIds`
    // (`GET /super-admin/users`, qui joint les noms d'établissement EN MÉMOIRE plutôt que par un
    // `include`).
    'findMany',
    // `EstablishmentRepository.findByIdOrThrow` : `GET /super-admin/establishments/:id` et
    // `POST /super-admin/grants` (vérification de l'établissement visé avant d'écrire l'octroi).
    'findUniqueOrThrow',
  ],
  AccessLink: [
    // `AccessLinkRepository.findByTokenHashWithUser` : `POST /auth/access-link/consume`.
    'findUnique',
    // `AccessLinkRepository.create` depuis `AccessLinkDomain.issue` :
    // `POST /super-admin/users/:id/access-link`, `POST /auth/password-forgot`. (Le même `issue` sous
    // `POST /super-admin/establishments` passe, lui, par `runAsSuperAdmin`.)
    'create',
    // `AccessLinkRepository.invalidateActiveForUser` (réémission, même route que `create`) et
    // `.consumeIfActive` (`POST /auth/access-link/consume`, marque `usedAt` sous condition).
    'updateMany',
  ],
  // `SuperAdminAccessGrant` n'y figure PAS, et ce n'est pas un oubli. Il a SIX emplois dans
  // `src/main`, tous dans `accessGrant.repository.ts`, et aucun ne tourne sans contexte — mais
  // pas tous pour la même raison, et c'est la distinction qui compte :
  //   - CINQ sont encadrés par `runAsSuperAdmin` (`findMany` des octrois vivants, `create`,
  //     `count`, `findUnique`, `update`), donc déclarés dans SUPERADMIN_GLOBAL_OPERATIONS ;
  //   - le SIXIÈME, `findForEstablishment` (`GET /e/:establishmentId/admin/grants`), tourne sous
  //     un contexte de TENANT réel — son `establishmentId` vient de
  //     `tenantContext.establishmentScope()`, qui lève s'il n'y a pas de tenant. Il ne peut donc
  //     structurellement pas atteindre cette table-ci, sans y être déclaré pour autant.
  // ATTENTION AU MOTIF DE RECHERCHE POUR CETTE ÉNUMÉRATION : un motif comme
  // `\.superAdminAccessGrant\.findMany` sur une seule ligne se brise sur le saut de ligne que le
  // formateur insère entre le modèle et le verbe, et fait manquer des emplois. Cette énumération
  // sert de CONTRE-VÉRIFICATION à la mesure par instrumentation ; un motif qui rate un site rend
  // cette contre-vérification muette. Le motif correct traverse les lignes :
  // `\.superAdminAccessGrant\s*\n?\s*\.<verbe>`. Sur les quatre modèles globaux : 27 sites
  // d'appel.
}

// Verbes Prisma d'écriture imbriquée : la présence de l'un d'eux dans la valeur d'un champ
// signale une relation à vérifier plutôt qu'une simple colonne scalaire.
const WRITE_VERBS = [
  'create',
  'createMany',
  'connectOrCreate',
  'connect',
  'set',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'disconnect',
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
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date)

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

const expectedValue = (
  store: TenantStore,
  field: string,
  model: string,
  operation: string,
): string => {
  if (store.kind !== 'tenant') {
    throw new TenantScopeMissingError(model, operation, field)
  }
  const value =
    field === 'serviceId'
      ? store.tenant.serviceId
      : store.tenant.establishmentId
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

const assertWhere = (
  model: string,
  operation: string,
  args: Dict,
  field: string,
  store: TenantStore,
): void => assertWhereLike(model, operation, args.where, field, store)

// Empêche un update de déplacer une ligne d'un tenant à l'autre : si serviceId ou
// establishmentId figure dans les données, sa valeur doit être celle du tenant courant. Absent,
// c'est le cas normal (l'update ne touche pas à ces colonnes) et on laisse passer.
const assertNoTenantMove = (
  model: string,
  operation: string,
  data: unknown,
  store: TenantStore,
): void => {
  if (!isDict(data)) {
    return
  }
  const family = familyOf(model)
  if (
    family === 'service' &&
    'serviceId' in data &&
    data.serviceId !== expectedValue(store, 'serviceId', model, operation)
  ) {
    throw new TenantScopeMissingError(model, operation, 'serviceId')
  }
  if (
    family !== 'global' &&
    'establishmentId' in data &&
    data.establishmentId !==
      expectedValue(store, 'establishmentId', model, operation)
  ) {
    throw new TenantScopeMissingError(model, operation, 'establishmentId')
  }
}

// Vérifie que `row` porte les colonnes de tenant attendues pour son modèle. Une ligne imbriquée
// peut omettre serviceId : Prisma l'hérite du parent déjà vérifié par la clé composite, ou refuse.
const assertRowScope = (
  model: string,
  operation: string,
  row: Dict,
  store: TenantStore,
  nested: boolean,
): void => {
  const family = familyOf(model)
  if (
    family === 'service' &&
    !(nested && row.serviceId === undefined) &&
    row.serviceId !== expectedValue(store, 'serviceId', model, operation)
  ) {
    throw new TenantScopeMissingError(model, operation, 'serviceId')
  }
  if (
    family !== 'global' &&
    row.establishmentId !==
      expectedValue(store, 'establishmentId', model, operation)
  ) {
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
      assertData(model, `${operation}.create`, entry.create, store, true)
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
      assertData(childModel, `${operation}.create`, entry.create, store, true)
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
const assertNestedWrite = (
  childModel: string,
  operation: string,
  value: Dict,
  store: TenantStore,
): void => {
  const field =
    familyOf(childModel) === 'service' ? 'serviceId' : 'establishmentId'
  if ('create' in value) {
    assertData(childModel, `${operation}.create`, value.create, store, true)
  }
  if (isDict(value.createMany) && 'data' in value.createMany) {
    assertData(
      childModel,
      `${operation}.createMany`,
      value.createMany.data,
      store,
      true,
    )
  }
  if ('connectOrCreate' in value) {
    assertConnectOrCreate(
      childModel,
      `${operation}.connectOrCreate`,
      value.connectOrCreate,
      field,
      store,
    )
  }
  if ('connect' in value) {
    assertConnectEntries(
      childModel,
      `${operation}.connect`,
      value.connect,
      field,
      store,
    )
  }
  if ('set' in value) {
    assertConnectEntries(
      childModel,
      `${operation}.set`,
      value.set,
      field,
      store,
    )
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
    assertNestedUpdate(
      childModel,
      `${operation}.updateMany`,
      value.updateMany,
      store,
    )
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
const assertNestedRelations = (
  model: string,
  operation: string,
  row: Dict,
  store: TenantStore,
): void => {
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

const assertData = (
  model: string,
  operation: string,
  data: unknown,
  store: TenantStore,
  nested = false,
): void => {
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) {
    if (!isDict(row)) {
      throw new TenantScopeMissingError(model, operation, 'data')
    }
    assertRowScope(model, operation, row, store, nested)
    assertNestedRelations(model, operation, row, store)
  }
}

// Contrepartie, côté écriture, de assertTenantReadScope plus
// bas : `assertRowScope`, appelé par `assertData` ci-dessus, compare la ligne à UN tenant
// ambiant (`store.tenant`) — le superadmin n'en a aucun par construction, et sa seule écriture
// déclarée à ce jour (EstablishmentMembership.create) doit justement pouvoir porter
// N'IMPORTE QUEL établissement. `assertData` reste donc réservé, TEL QUEL, au contexte tenant et
// aux appels IMBRIQUÉS (voir plus bas) ; cette fonction couvre l'appel de tête sous superadmin —
// mêmes lignes, même récursion (`assertNestedRelations`), MOINS `assertRowScope`. C'est cette
// récursion qui referme le trou : dès qu'une écriture imbriquée touche un
// modèle de tenant (`assertNestedWrite`, plus haut), elle retombe sur un nouvel appel à
// `assertData` — celui-là inchangé, donc avec sa propre vérification de `assertRowScope` — qui
// refuse alors (store toujours superadmin, jamais tenant) toute écriture imbriquée vers un
// tenant. Seule la ligne de TÊTE, celle que SUPERADMIN_OPERATIONS a explicitement autorisée,
// échappe à ce contrôle — pas ses enfants.
const assertSuperAdminWriteRow = (
  model: string,
  operation: string,
  data: unknown,
  store: TenantStore,
): void => {
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
const assertWriteData = (
  model: string,
  operation: string,
  data: unknown,
  store: TenantStore,
): void => {
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
    ? Object.entries(value).filter(
        ([, included]) => included !== false && included !== undefined,
      )
    : []

const includedRelationKeys = (value: unknown): string[] =>
  includedRelationEntries(value).map(([key]) => key)

// Un include/select depuis un modèle global qui touche une relation de tenant n'est sûr que sur
// une opération à une seule ligne (findUnique/findUniqueOrThrow) : c'est la seule garantie que
// les données incluses appartiennent à un seul tenant.
const assertGlobalInclude = (
  model: string,
  operation: string,
  args: Dict,
): void => {
  const tenantRelations = GLOBAL_TENANT_RELATIONS[model]
  if (!tenantRelations) {
    return
  }
  const requested = [
    ...includedRelationKeys(args.include),
    ...includedRelationKeys(args.select),
  ]
  const touchesTenantData = requested.some((key) =>
    tenantRelations.includes(key),
  )
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
// Ce contrôle n'inspectait auparavant que le PREMIER niveau des arguments, et seulement
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
// même fuite, fermée auparavant au premier niveau seulement, ici fermée à n'importe quelle
// profondeur.
//
// Échoue FERMÉ à chaque niveau de la descente, y compris en profondeur : `include` n'accepte que
// des relations, toute clé doit donc être déclarée dans MODEL_RELATIONS[model] — une clé absente
// est refusée, jamais laissée passer en silence. `_count` (mot réservé Prisma, jamais un nom de
// relation) en est le cas explicite : refusé sous `include` (clé non déclarée) comme sous
// `select` (refus dédié — `select`, qui mélange colonnes
// scalaires et relations, ne peut exiger la déclaration de tout le reste, mais `_count` ne
// collisionne jamais avec un nom de champ ou de relation du schéma). Et `model` peut très bien
// n'avoir AUCUNE relation connue (MODEL_RELATIONS[model]
// vaut alors {}, jamais `undefined` : la table est exhaustive sur les 26 modèles du schéma), ce
// qui refuse alors toute clé sans distinction. Une relation reconnue est en revanche toujours
// suivie plus loin par récursion, que la transition établissement → service s'y applique ou
// non : ne descendre que sous condition serait le point exact où un modèle ou une relation non
// reconnus pourraient être traités comme sûrs par défaut — la limite que cette fonction referme.

// UN MODÈLE GLOBAL SERT DE PONT. La
// transition établissement → service, vérifiée juste en dessous, ne dit rien d'une relation vers
// un modèle GLOBAL (`Service.establishment`, `EstablishmentMembership.user`…) ni d'une relation
// REPARTANT d'un modèle global vers un modèle de tenant (`Establishment.patients`…) : ni l'une ni
// l'autre n'est une transition établissement → service, donc ni l'une ni l'autre n'était vérifiée.
//
// CE QUI SUIT EST VRAI UNIQUEMENT SOUS SUPERADMIN. Une affirmation qui semblerait plausible mais
// fausse — « sous tenant, cela ne fuit pas, géométriquement » — serait pire que le trou
// lui-même : une fausse assurance écrite dans ce fichier dissuade le prochain de chercher. Ce
// qui est vrai :
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
//     Ce trou est ANTÉRIEUR (vérifié : le verdict est identique avant et après —
//     voir la preuve de monotonie, tenant-guard.test.ts) ; ce paragraphe ne l'ouvre pas et, à
//     dessein, ne le ferme pas non plus — le fermer pour de bon exige de suivre la CARDINALITÉ de
//     chaque relation (à-un / à-plusieurs) à travers tout le graphe, une information que
//     MODEL_RELATIONS ne porte pas aujourd'hui, et qui touche le chemin de TOUS les comptes, pas
//     seulement le super-admin.
//
//     FERMÉ DEPUIS : MODEL_RELATIONS porte désormais la cardinalité, et
//     `assertNoGlobalToManyBridge` (plus bas) refuse ce franchissement sous tenant comme sous
//     superadmin, en lecture comme en écriture. Ce paragraphe est gardé tel quel, au passé, pour
//     montrer COMMENT le trou avait été vu et pourquoi il avait été laissé ouvert un temps — et
//     parce que « sous tenant, cela ne fuit pas, géométriquement » est l'exemple type de la
//     fausse assurance qu'on ne doit pas réécrire dans ce fichier.
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

// CE QUE LA RÈGLE CI-DESSUS AVAIT NOMMÉ SANS LE FERMER, et qui vaut pour
// le chemin ORDINAIRE, pas seulement pour le super-admin.
//
// Le raisonnement, en entier, parce que c'est une asymétrie et qu'elle se relit mal :
//   - sous tenant, la racine est bornée par son `where` (assertWhere), qui épingle
//     l'établissement — c'est là, et nulle part ailleurs, que naît la sûreté du chemin ordinaire ;
//   - descendre reste sûr tant que chaque saut reste borné par cette racine. Les relations qui
//     MÈNENT à un modèle global le sont : elles sont TOUTES à-un (vérifié relation par relation
//     dans MODEL_RELATIONS, et tenu par le test de conformité au schéma), donc une ligne déjà
//     épinglée ne mène qu'à UNE ligne globale ;
//   - mais une relation qui REPART d'un modèle global peut être à-PLUSIEURS, et celle-là n'est
//     plus bornée par rien. `User.establishmentMemberships` rend les appartenances de TOUS les
//     établissements du compte ; de là, `establishment` puis `patients` rendent les patients d'un
//     AUTRE établissement que celui du contexte. Condition d'exploitation : qu'un compte soit
//     membre des deux — ce que permettre de créer un second établissement rend possible, et
//     c'est pour cela que ce défaut, ANTÉRIEUR au chantier, se corrige
//     maintenant.
//
// Mesuré avant correctif, sur la vraie base (`src/test/e2e/tenant-guard-pont-global.test.ts`) :
// sous le contexte de tenant de l'établissement A, la chaîne ci-dessus rendait le patient de
// l'établissement B ; et `Establishment.update({ where: { id: B }, data: { patients: { create }}})`
// ÉCRIVAIT un patient dans B. Le pont était ouvert dans les deux sens.
//
// CE QUI EST REFUSÉ, exactement : repartir d'un modèle GLOBAL par une relation à-PLUSIEURS, à
// n'importe quelle profondeur, y compris depuis la racine. Aucune valeur ne pourrait border cette
// traversée — il n'existe pas de « bon » établissement à comparer, exactement comme pour
// assertNoGlobalBridgeUnderSuperAdmin.
//
// CE QUI RESTE PERMIS, et ce n'est pas un oubli : la relation à-UN vers un modèle global
// (`EstablishmentMembership.user`, `AccessLink.user`), qui est la lecture réelle du dépôt
// (membership.repository.ts, accessLink.repository.ts) et qui ne peut rien traverser — une ligne
// ne mène qu'à une ligne. Fermer celle-là aussi serait fermer plus que le défaut.
//
// SOUS QUELS CONTEXTES — ET LA PORTÉE EXACTE DE CE QUI RESTE OUVERT, qui est BIEN PLUS LARGE
// que le seul chemin de la connexion.
//
// La règle s'applique sous `tenant` et sous `superadmin`. Pas sous `system`
// (assertNestedInclude n'y est pas appelée du tout). Et pas SANS CONTEXTE — or « sans contexte »
// ne veut pas dire « la connexion » : `routes/index.ts` appelle `tenantContext.clear()` en tête
// de CHAQUE requête, et `tenant.plugin.ts` est le SEUL à appeler `enter()`. Donc **aucune route
// hors `/e/:establishmentId/...` n'entre jamais dans un contexte** : `/auth`, `/me` et TOUT le
// préfixe `/super-admin` s'exécutent sans store, leurs dépôts n'entrant dans `runAsSuperAdmin`
// qu'au coup par coup, requête par requête. Cette règle-ci ne les couvre donc pas.
//
// CE QUE CELA LAISSAIT OUVERT, écrit en clair plutôt que découvert plus tard : une lecture
// future ajoutée sous `/super-admin` et laissée hors d'un `runAsSuperAdmin` pouvait atteindre des
// patients par `Establishment.findUnique({ include: { patients: true } })` — en CONTOURNANT
// entièrement `SUPERADMIN_OPERATIONS`, dont l'absence de `Patient.findMany` est justement motivée
// par « le super-admin compte, il ne lit pas ». Ce n'était pas une régression (mesuré : le
// verdict était identique avant et après), c'était un trou PRÉEXISTANT, laissé
// ouvert à dessein ici.
//
// REPRIS PAR UNE AUTRE VOIE — et il faut lire laquelle, parce
// qu'elle ne ferme pas la même chose. L'absence de contexte est devenue un QUATRIÈME contexte
// DÉCLARÉ (NO_CONTEXT_GLOBAL_OPERATIONS, plus haut) : sans store, un modèle global ne franchit
// plus que les couples (modèle, opération) nommés, chacun avec sa route. `Establishment.
// findUnique` n'en fait pas partie, donc l'exemple ci-dessus est aujourd'hui refusé — mais par la
// PORTE DE PERMISSION, pas par la règle de cardinalité, qui reste inapplicable sans contexte
// (voir juste en dessous). Autrement dit : la liste des opérations capables d'arriver jusqu'ici
// est close et nommée, la descente qui suivrait l'une d'elles ne l'est toujours pas.
//
// Pourquoi la connexion est la raison pour laquelle cette règle-ci, la cardinalité, ne s'étend
// TOUJOURS PAS au cas sans contexte — et pourquoi ce n'est pas un oubli :
// `UserRepository.findByID` lit `user.findUniqueOrThrow({ include: { establishmentMemberships:
// { include: { establishment, serviceMemberships: { include: { service } } } } } })` juste après
// `clear()`, précisément pour ÉTABLIR à quels établissements le compte appartient — et pas
// seulement à la connexion : `cookie.plugin.ts` le fait sur CHAQUE requête authentifiée.
// `User.establishmentMemberships` est une relation à-plusieurs depuis un modèle global : étendre
// cette règle à `store === undefined` refuserait cette lecture, donc toute requête
// authentifiée. Cette lecture-là est la source de l'autorité, pas une traversée de frontière.
// Mais c'est un exemple, pas la borne : la borne est « toute route non tenant ».
//
// Sous superadmin, la règle plus large (assertNoGlobalBridgeUnderSuperAdmin, appelée
// juste avant) refuse déjà ces cas-là et les autres ; celle-ci ne l'exclut pas pour autant —
// si cette règle-là était un jour assouplie, la cardinalité tiendrait encore.
const assertNoGlobalToManyBridge = (
  model: string,
  relation: ModelRelation,
  operation: string,
  relationField: string,
  store: TenantStore | undefined,
): void => {
  if (store?.kind !== 'tenant' && store?.kind !== 'superadmin') {
    return
  }
  if (familyOf(model) !== 'global' || !relation.list) {
    return
  }
  throw new TenantScopeMissingError(
    model,
    operation,
    `relation '${relationField}' repart du modèle global ${model} vers PLUSIEURS ${relation.model} — rien ne borne ces lignes à l'établissement du contexte ; lire ${relation.model} par sa propre racine, filtrée`,
  )
}

// Traite une relation d'include/select une fois son modèle cible résolu, commun à `include` et
// `select` : sépare ce cas partagé du reste pour garder assertNestedInclude lisible (extrait
// aussi pour la complexité cognitive du linter, qui compte les deux boucles ensemble sinon).
// Vérifie la transition établissement → service si elle s'applique ICI, refuse le pont vers un
// modèle global sous superadmin (voir assertNoGlobalBridgeUnderSuperAdmin ci-dessus) puis le pont
// à-plusieurs DEPUIS un modèle global sous tenant comme sous superadmin
// (assertNoGlobalToManyBridge), puis redescend récursivement — quelle que soit cette famille,
// jamais seulement si elle correspond.
//
// ORDRE DES DEUX REFUS DE PONT : le plus ancien d'abord, à dessein. Sous superadmin les deux
// s'appliquent ; laisser `assertNoGlobalBridgeUnderSuperAdmin` parler en premier garde inchangés
// les messages et les verdicts de ce contexte (voir la mesure de monotonie), et la règle de
// cardinalité y reste la seconde ligne plutôt que la première.
const assertNestedIncludeEntry = (
  model: string,
  relation: ModelRelation,
  operation: string,
  relationField: string,
  value: unknown,
  store: TenantStore | undefined,
): void => {
  const childModel = relation.model
  if (
    familyOf(model) === 'establishment' &&
    familyOf(childModel) === 'service'
  ) {
    assertServiceRelationFilter(model, operation, relationField, value, store)
  }
  assertNoGlobalBridgeUnderSuperAdmin(
    model,
    childModel,
    operation,
    relationField,
    store,
  )
  assertNoGlobalToManyBridge(model, relation, operation, relationField, store)
  if (isDict(value)) {
    assertNestedInclude(
      childModel,
      `${operation}>${relationField}`,
      value,
      store,
    )
  }
}

const assertNestedInclude = (
  model: string,
  operation: string,
  args: Dict,
  store: TenantStore | undefined,
): void => {
  const relations = MODEL_RELATIONS[model] ?? {}
  // `include` n'accepte que des relations : toute clé doit donc être déclarée. Une clé inconnue
  // est refusée plutôt que laissée sans contrôle — y compris `_count`, qui compte des enfants
  // sans les filtrer.
  for (const [relationField, value] of includedRelationEntries(args.include)) {
    const relation = relations[relationField]
    if (!relation) {
      throw new TenantScopeMissingError(
        model,
        operation,
        `relation '${relationField}' non déclarée — l'ajouter à MODEL_RELATIONS['${model}']`,
      )
    }
    assertNestedIncludeEntry(
      model,
      relation,
      operation,
      relationField,
      value,
      store,
    )
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
    const relation = relations[relationField]
    if (!relation) {
      continue
    }
    assertNestedIncludeEntry(
      model,
      relation,
      operation,
      relationField,
      value,
      store,
    )
  }
}

// Descend dans les relations imbriquées d'un `data` de mise à jour (update / updateMany /
// updateManyAndReturn, ou la branche `update` d'un upsert), avec les mêmes règles que pour une
// création : relation non déclarée refusée, create/createMany/connectOrCreate/connect/set
// vérifiés. Ne vérifie PAS les colonnes de tenant de `data` lui-même — un `data` de mise à jour
// n'en porte normalement aucune, et le cas où il en porte une est déjà couvert par
// assertNoTenantMove.
const assertNestedRelationsInUpdate = (
  model: string,
  operation: string,
  data: unknown,
  store: TenantStore,
): void => {
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
function assertUpdatePayload(
  model: string,
  operation: string,
  data: unknown,
  store: TenantStore,
): void {
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
// SOUS SUPERADMIN, une opération sur une table globale doit être
// déclarée pour passer, et elle l'est ici, avant même assertGlobalInclude : rien dans ce fichier
// ne borne une écriture sur un modèle global (pas de colonne de tenant à comparer), donc rien ne
// s'opposait à `Establishment.deleteMany({})`.
//
// LA DÉCLARATION EST UNE TABLE PAR MODÈLE
// (SUPERADMIN_GLOBAL_OPERATIONS, plus haut, où chaque entrée est justifiée une par une) plutôt
// qu'un ensemble d'opérations valable pour tous les modèles globaux à la fois.
const assertSuperAdminGlobalOperationDeclared = (
  model: string,
  operation: string,
): void => {
  const permises = SUPERADMIN_GLOBAL_OPERATIONS[model]
  if (!permises?.includes(operation)) {
    throw new TenantScopeMissingError(model, operation, 'superadmin')
  }
}

// Une écriture sur un modèle global n'ouvre QUE sa propre ligne. Son `data` peut porter
// une écriture imbriquée (`Establishment.create({ data: { patients: { create: … } } })`), et
// `assertGlobalScope` n'inspectait jusqu'ici que `include`/`select`, jamais `data` — il n'en avait
// pas besoin tant que toute écriture globale était refusée. Maintenant qu'elles peuvent être
// déclarées, la même récursion que pour une racine de tenant s'applique : `assertSuperAdminWriteRow`
// (donc `assertNestedRelations`) refuse toute relation absente de NESTED_RELATIONS — et aucun
// modèle global n'y a d'entrée, donc toute écriture imbriquée depuis une racine globale est
// refusée. Sans cet appel, déclarer `Establishment.create` rouvrirait, par son `data`, le pont vers
// les modèles de tenant que assertNoGlobalBridgeUnderSuperAdmin ferme du côté `include`.
//
// CE CONTRÔLE VAUT AUSSI SOUS UN CONTEXTE DE TENANT, et ne le faisait pas auparavant.
// Sous un contexte de tenant ordinaire,
// `Establishment.create({ data: { name, patients: { create: … } } })` écrivait un patient dans un
// autre établissement, et `Establishment.update({ where: { id: autre }, data: { patients:
// { create: … } } })` l'écrivait dans un établissement EXISTANT d'à côté (mesuré, voir
// `src/test/e2e/tenant-guard-pont-global.test.ts`). D'où l'appel ci-dessous pour `tenant` comme
// pour `superadmin`.
//
// CE QUE CET APPEL NE FERME PAS, ET IL FAUT LE LIRE AVANT DE CROIRE L'ÉCRITURE VERROUILLÉE — dire
// qu'un côté écriture est « refermé » tout court promettrait plus que ce code ne tient,
// exactement le genre de phrase que ce fichier existe pour empêcher. Ce qui est fermé, c'est le
// `data` IMBRIQUÉ : une écriture qui
// atteint une AUTRE table à travers une relation. L'écriture PLATE sur la ligne globale
// elle-même reste, sous contexte de tenant, entièrement ouverte — un modèle global n'a aucune
// colonne de tenant à comparer, donc rien ici ne s'y oppose :
//     Establishment.update({ where: { id: unAutre }, data: { name: '…' } })
//     Establishment.deleteMany({})
//     User.updateMany({ data: { isSuperAdmin: true } })
// C'est PRÉEXISTANT, hors du périmètre de ce contrôle-ci (dont le défaut visé est le
// franchissement de relation), et non traité ici plutôt que traité à moitié. Le pendant existe déjà pour le
// superadmin — SUPERADMIN_GLOBAL_OPERATIONS, plus haut, qui n'autorise que des couples nommés ;
// il n'a pas d'équivalent pour le contexte tenant.
//
// POURQUOI LA LISTE BLANCHE ICI, ET LA CARDINALITÉ EN LECTURE — l'asymétrie est délibérée, pas un
// oubli. Côté écriture, le mécanisme de déclaration existe déjà (NESTED_RELATIONS) et aucun
// modèle global n'y figure : TOUTE écriture imbriquée depuis une racine globale est donc refusée,
// à-un comprise, et le remède est celui que le dépôt applique déjà partout — la colonne scalaire
// (`userId: u`) plutôt que `user: { connect: { id: u } }`, puis une seconde écriture déclarée.
// Côté lecture, la même liste blanche est impossible : la relation à-UN vers un modèle global est
// une lecture réelle et légitime du dépôt (`EstablishmentMembership.findMany` avec
// `include: { user }`, `AccessLink.findUnique` avec `include: { user }`), que rien ne remplace à
// coût égal. La cardinalité y sépare exactement ce qui traverse de ce qui ne traverse pas.
const assertGlobalNestedWrite = (
  model: string,
  operation: string,
  args: Dict,
  store: TenantStore,
): void => {
  if (WRITE_OPERATIONS.has(operation)) {
    assertSuperAdminWriteRow(
      model,
      operation,
      operation === 'upsert' ? args.create : args.data,
      store,
    )
  }
  if (UPDATE_OPERATIONS.has(operation)) {
    assertSuperAdminWriteRow(model, operation, args.data, store)
  }
  if (operation === 'upsert') {
    assertSuperAdminWriteRow(model, `${operation}.update`, args.update, store)
  }
}

// Porte de permission du QUATRIÈME contexte, celui de l'absence de contexte : jumelle de
// `assertSuperAdminGlobalOperationDeclared` ci-dessus, sur
// NO_CONTEXT_GLOBAL_OPERATIONS. Le détail de l'erreur dit `sans-contexte` plutôt que
// `superadmin`, pour que le refus nomme la table à laquelle ajouter le couple — les deux tables
// ne se recouvrent pas.
const assertNoContextGlobalOperationDeclared = (
  model: string,
  operation: string,
): void => {
  const permises = NO_CONTEXT_GLOBAL_OPERATIONS[model]
  if (!permises?.includes(operation)) {
    throw new TenantScopeMissingError(model, operation, 'sans-contexte')
  }
}

const assertGlobalScope = (
  model: string,
  operation: string,
  args: Dict,
  store: TenantStore | undefined,
): void => {
  // En PREMIER, avant toute autre vérification, exactement comme la porte
  // superadmin juste en dessous. Sans store, un modèle global ne rencontrait aucune porte de
  // permission — voir NO_CONTEXT_GLOBAL_OPERATIONS pour le défaut fermé ici et pour ce qu'il
  // reste ouvert derrière cette porte.
  if (!store) {
    assertNoContextGlobalOperationDeclared(model, operation)
  }
  if (store?.kind === 'superadmin') {
    assertSuperAdminGlobalOperationDeclared(model, operation)
  }
  // `tenant` en plus de `superadmin`. Ni `system` (qui contourne tout le garde-fou par
  // construction) ni l'absence de contexte — laquelle couvre TOUTE route non tenant (`/auth`,
  // `/me`, tout `/super-admin`), pas seulement la connexion : même limite, et même portée, que
  // pour la lecture (voir assertNoGlobalToManyBridge, qui la détaille).
  //
  // La porte ci-dessus a réduit la liste des écritures qui peuvent arriver
  // jusqu'ici sans contexte à quatre couples nommés (`User.create`, `User.update`,
  // `AccessLink.create`, `AccessLink.updateMany`) ; elle n'a PAS étendu cette descente-ci à ce
  // cas. Une écriture imbriquée sous l'un de ces quatre `data` reste donc non vérifiée sans
  // contexte — limite nommée, point 2 du commentaire de NO_CONTEXT_GLOBAL_OPERATIONS.
  if (store?.kind === 'superadmin' || store?.kind === 'tenant') {
    assertGlobalNestedWrite(model, operation, args, store)
  }
  assertGlobalInclude(model, operation, args)
  if (store?.kind !== 'system') {
    assertNestedInclude(model, operation, args, store)
  }
}

// Porte de permission du contexte superadmin : le couple (modèle, opération) doit figurer dans
// SUPERADMIN_OPERATIONS, exhaustive par construction (tout couple absent est refusé).
//
// CETTE PORTE NE FAIT PLUS SORTIR DE
// assertTenantScope. Une première version faisait `return` juste après elle, ce qui sautait toute
// la descente structurelle (assertNestedInclude, assertData →
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
const assertSuperAdminOperationDeclared = (
  model: string,
  operation: string,
): void => {
  const permises = SUPERADMIN_OPERATIONS[model]
  if (!permises?.includes(operation)) {
    throw new TenantScopeMissingError(model, operation, 'superadmin')
  }
}

// `assertWhere` compare le `where` à UN tenant ambiant : sans objet sous superadmin (même raison
// que assertData, plus haut), donc réservé au contexte tenant plutôt que refusé partout — ce qui
// aurait rendu la liste déclarée inutilisable en lecture, contrairement aux exemples ci-dessous
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
const assertTenantUpsertPayload = (
  model: string,
  operation: string,
  args: Dict,
  store: TenantStore,
): void => {
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
  // d'établissement) : la transition établissement → service que cette
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

export const buildTenantGuardExtension = (
  tenantContext: TenantContextInterface,
) =>
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

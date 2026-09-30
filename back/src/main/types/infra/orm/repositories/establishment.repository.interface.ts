import type {
  Establishment,
  EstablishmentMembership,
} from '../../../../../generated/client'
import type { EstablishmentRole } from '../../../../../generated/enums'
import type { PrimaTransactionClient } from '../client'
import type { PlatformAccessLogPage } from './activityLog.repository.interface'

export type EstablishmentEntityRepo = Establishment

// Le premier administrateur ENCORE actif — pas nécessairement le tout
// premier historiquement. Nul quand l'établissement n'a aucun administrateur actif, ce qui
// arrive si le seul (ou tous) ont été désactivés depuis.
//
// Arbitrage de Léo : le nom est
// visible, comme partout ailleurs où le super-admin regarde (le journal d'activité rend déjà
// `userFirstName`/`userLastName` de l'auteur ; cacher le nom ici et le montrer là est un théâtre,
// pas une protection). Un nom de collègue n'est PAS une donnée de santé — à la différence d'un
// nom de patient — et le diagnostic de support en a besoin. `firstName`/`lastName` sont
// nullables (comme sur `User`) : un compte peut ne pas les avoir renseignés.
//
// Départage à créneau égal :
// `countersFor` trie les rattachements ADMIN par `createdAt` PUIS `userId` — un ordre total, donc
// déterministe même quand deux rattachements portent exactement le même horodatage (résolution
// de la colonne, ou deux écritures dans la même transaction). Le second critère n'a aucune
// signification métier ; il existe seulement pour qu'un résultat ne dépende jamais de l'ordre de
// retour non garanti de Postgres à égalité stricte du premier.
export type FirstAdmin = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
} | null

// La règle de comptage des désactivés,
// choisie et non plus seulement constatée. `serviceCount` et `accountCount` répondent à la même
// question que `firstAdmin` — cet établissement est-il VIVANT, y a-t-il quelqu'un pour s'en
// servir — donc les TROIS excluent les désactivés, symétriquement : un service désactivé n'est
// plus utilisable, un compte désactivé ne peut plus se connecter. `patientCount` est un compte
// différent (une donnée de santé agrégée, spec §3.3) : `Patient` ne porte pas de désactivation,
// la question ne se pose pas.
//
// Un seul nombre par colonne, pas deux (total / utilisable) : le contrat de clés
// fixe la liste EXACTE des neuf champs de la ligne, close. Si Léo
// préfère les deux nombres (« deux nombres valent peut-être mieux qu'un
// choix »), c'est un changement de contrat à trancher avec lui, pas une réouverture silencieuse
// ici.
//
// `lastActivityAt`, PAS `lastAccessAt` : le nom précédent
// mentait — il portait la dernière connexion de n'importe quel membre, À N'IMPORTE QUEL AUTRE
// établissement, jamais une activité DANS celui-ci. Un établissement abandonné semblait vivant
// dès qu'un de ses membres se connectait ailleurs. Recalculé depuis `ActivityLog`, qui porte
// `establishmentId` et dont `findMany` est déjà déclaré (SUPERADMIN_OPERATIONS) : la
// dernière ligne de journal DE CET ÉTABLISSEMENT, ou `null` si aucune — un établissement sans
// activité doit se voir comme tel, pas hériter d'une activité empruntée à un autre.
//
// LIMITES CONNUES, à lire avant d'interpréter une valeur ancienne ou nulle :
// (1) `ActivityLog` ne porte que des ÉCRITURES (créations/modifications) — une
// consultation seule, sans écriture, ne pose aucune ligne, donc cette colonne SOUS-DÉCLARE
// l'activité réelle d'un établissement où l'on ne fait que consulter. (2) Le journal est purgé
// après douze mois (`ActivityLogRepository.deleteOlderThan`, tâche de purge planifiée) : passé
// ce délai, `lastActivityAt` RÉGRESSE À `null` pour un établissement resté inactif depuis, même
// si son historique réel remonte plus loin que douze mois — ce n'est pas une remise à zéro de
// l'établissement, seulement la disparition de la trace qui permettait de le dire.
export type EstablishmentCounters = {
  serviceCount: number
  accountCount: number
  patientCount: number
  firstAdmin: FirstAdmin
  lastActivityAt: Date | null
}

export type EstablishmentListRow = EstablishmentEntityRepo &
  EstablishmentCounters

// Le détail d'un établissement (spec §6.2 — « services, membres, journal
// d'activité ») — la ligne de la liste, augmentée des trois listes qui font de cet écran l'outil
// de diagnostic (« untel ne voit plus ses patients » se comprend par ses rattachements, pas par
// un compteur seul).
//
// Arbitrage de Léo : le tableau liste TOUJOURS tout — désactivé compris —
// et chaque ligne porte sa propre `deactivatedAt` ; c'est le COMPTEUR (`serviceCount` /
// `accountCount`, ci-dessus) qui, lui, ne compte que l'utilisable. Un établissement affichant
// « 1 service » au-dessus d'une liste de deux n'est donc pas une incohérence : on voit qu'un
// service désactivé existe encore (ne serait-ce que pour le réactiver), et le compteur reste
// lisible dès que la liste le montre à côté.
export type EstablishmentServiceRow = {
  id: string
  name: string
  createdAt: Date
  deactivatedAt: Date | null
}

// Un membre de l'établissement, vu depuis l'établissement (symétrique de
// `EstablishmentMembershipRow`, vue depuis le compte). Nom visible — voir le commentaire sur
// `FirstAdmin`.
export type EstablishmentMemberRow = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: EstablishmentRole
  createdAt: Date
  deactivatedAt: Date | null
}

// `activityLog` A ETE RETIRE de cette forme le 2026-10-01, en meme temps que sa borne de 100
// lignes. Le journal se lit desormais par sa propre route paginee (`GET
// /super-admin/establishments/:id/activity-log`) : le garder ICI EN PLUS aurait donne DEUX sources
// a une seule et meme table a l'ecran — la premiere page venant du detail, les suivantes de la
// route, avec un aller-retour reseau de trop des le montage. `lastActivityAt`, lui, reste sur cette
// forme (herite d'`EstablishmentListRow`) : `getById` le derive d'une lecture d'UNE ligne.
export type EstablishmentDetail = EstablishmentListRow & {
  services: EstablishmentServiceRow[]
  members: EstablishmentMemberRow[]
}

// Rattachement brut d'un compte (recherche d'un compte) : ni l'e-mail ni aucune donnée
// de l'utilisateur — seulement ce qui vient d'`EstablishmentMembership`. Le nom de
// l'établissement est résolu séparément (`findManyByIds`), toujours par une lecture distincte,
// jamais un `include`.
export type EstablishmentMembershipRow = {
  id: string
  userId: string
  establishmentId: string
  role: EstablishmentRole
  createdAt: Date
}

export interface EstablishmentRepositoryInterface {
  // `Establishment` est un modèle global (spec §4.1) : le garde-fou le laisse déjà passer sans
  // contexte de tenant, rien à encadrer ici. `client` optionnel :
  // `EstablishmentDomain.createWithFirstAdmin` fournit le client de la
  // transaction qui englobe aussi la création du compte, le rattachement et l'émission du lien —
  // un échec de l'un annule les trois autres.
  create: (
    name: string,
    client?: PrimaTransactionClient,
  ) => Promise<EstablishmentEntityRepo>
  // `EstablishmentMembership`, lui, est un modèle d'établissement (ESTABLISHMENT_MODELS,
  // tenant-guard.ts) : sans tenant courant (la route qui appelle ceci n'en a aucun), cette
  // écriture doit passer par le contexte `superadmin` — voir l'implémentation.
  attachAdmin: (
    establishmentId: string,
    userId: string,
    client?: PrimaTransactionClient,
  ) => Promise<EstablishmentMembership>
  // Lecture nue, sans contexte — `Establishment` est global (spec §4.1).
  findAll: () => Promise<EstablishmentEntityRepo[]>
  findByIdOrThrow: (id: string) => Promise<EstablishmentEntityRepo>
  findManyByIds: (ids: string[]) => Promise<EstablishmentEntityRepo[]>
  rename: (id: string, name: string) => Promise<EstablishmentEntityRepo>
  // Les quatre compteurs et signaux de la liste/du détail (spec §3.3), pour un établissement —
  // voir le commentaire sur `EstablishmentCounters`.
  countersFor: (establishmentId: string) => Promise<EstablishmentCounters>
  // Tous les rattachements d'UN compte, tous établissements confondus (recherche d'un compte,
  // spec §3.4). `EstablishmentMembership` est un modèle d'établissement : passe par le contexte
  // `superadmin`.
  membershipsForUser: (userId: string) => Promise<EstablishmentMembershipRow[]>
  // Le détail d'un établissement (spec §6.2) : services, membres, journal.
  // `EstablishmentDomain.getById` compose `serviceCount` et
  // `accountCount`/`firstAdmin` à partir de CES DEUX listes plutôt que de rappeler
  // `countersFor` — qui relirait une seconde fois les mêmes tables (`Service`,
  // `EstablishmentMembership`, `User`) pour la même requête. `countersFor` reste la seule
  // lecture pour `list()`, qui n'a pas besoin des tableaux complets.
  servicesFor: (establishmentId: string) => Promise<EstablishmentServiceRow[]>
  membersFor: (establishmentId: string) => Promise<EstablishmentMemberRow[]>
  // PAGINÉE depuis le 2026-10-01, à la place de la borne dure de 100 lignes qui la coiffait : voir
  // l'implémentation pour ce que cette borne rendait inatteignable. Deux appelants — la route
  // dédiée `GET /super-admin/establishments/:id/activity-log`, et `EstablishmentDomain.getById`,
  // qui demande `pageSize: 1` parce que la TÊTE de la première page (ordre décroissant) EST
  // `lastActivityAt` ; il le lit donc ici plutôt qu'en rappelant `countersFor`.
  activityLogFor: (
    establishmentId: string,
    params: { page: number; pageSize: number },
  ) => Promise<PlatformAccessLogPage>
  // Extrait de `countersFor` : seule lecture que `getById` ne peut pas
  // dériver d'un tableau déjà chargé (`Patient.findMany` n'est pas déclaré, spec §3.3).
  patientCountFor: (establishmentId: string) => Promise<number>
}

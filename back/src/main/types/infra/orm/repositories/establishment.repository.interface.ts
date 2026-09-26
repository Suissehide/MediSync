import type {
  Establishment,
  EstablishmentMembership,
} from '../../../../../generated/client'
import type { EstablishmentRole } from '../../../../../generated/enums'
import type { ActivityLogEntityRepo } from './activityLog.repository.interface'
import type { PrimaTransactionClient } from '../client'

export type EstablishmentEntityRepo = Establishment

// Tâche 7 (étape 4a) : le premier administrateur ENCORE actif — pas nécessairement le tout
// premier historiquement. Nul quand l'établissement n'a aucun administrateur actif, ce qui
// arrive si le seul (ou tous) ont été désactivés depuis (consigne du brief, task-7-brief.md).
// Volontairement réduit à l'identifiant et l'adresse : pas de nom, l'adresse suffit à joindre et
// porte déjà une donnée personnelle — même principe de divulgation bornée que §3.3 de la spec.
//
// Départage à créneau égal (tour de correction 1, mineur) : `countersFor` trie les rattachements
// ADMIN par `createdAt` PUIS `userId` — un ordre total, donc déterministe même quand deux
// rattachements portent exactement le même horodatage (résolution de la colonne, ou deux
// écritures dans la même transaction). Le second critère n'a aucune signification métier ; il
// existe seulement pour qu'un résultat ne dépende jamais de l'ordre de retour non garanti de
// Postgres à égalité stricte du premier.
export type FirstAdmin = { id: string; email: string } | null

// Tour de correction 1 (relecture), Important n°2 : la règle de comptage des désactivés,
// choisie et non plus seulement constatée. `serviceCount` et `accountCount` répondent à la même
// question que `firstAdmin` — cet établissement est-il VIVANT, y a-t-il quelqu'un pour s'en
// servir — donc les TROIS excluent les désactivés, symétriquement : un service désactivé n'est
// plus utilisable, un compte désactivé ne peut plus se connecter. `patientCount` est un compte
// différent (une donnée de santé agrégée, spec §3.3) : `Patient` ne porte pas de désactivation,
// la question ne se pose pas.
//
// Un seul nombre par colonne, pas deux (total / utilisable) : le contrat de clés du Step 1 du
// brief (`task-7-brief.md`) fixe la liste EXACTE des neuf champs de la ligne, close. Si Léo
// préfère les deux nombres (son avis en revue : « deux nombres valent peut-être mieux qu'un
// choix »), c'est un changement de contrat à trancher avec lui, pas une réouverture silencieuse
// ici.
//
// `lastActivityAt`, PAS `lastAccessAt` (tour de correction 1, Important n°3) : le nom précédent
// mentait — il portait la dernière connexion de n'importe quel membre, À N'IMPORTE QUEL AUTRE
// établissement, jamais une activité DANS celui-ci. Un établissement abandonné semblait vivant
// dès qu'un de ses membres se connectait ailleurs. Recalculé depuis `ActivityLog`, qui porte
// `establishmentId` et dont `findMany` est déjà déclaré (SUPERADMIN_OPERATIONS, tâche 1) : la
// dernière ligne de journal DE CET ÉTABLISSEMENT, ou `null` si aucune — un établissement sans
// activité doit se voir comme tel, pas hériter d'une activité empruntée à un autre.
export type EstablishmentCounters = {
  serviceCount: number
  accountCount: number
  patientCount: number
  firstAdmin: FirstAdmin
  lastActivityAt: Date | null
}

export type EstablishmentListRow = EstablishmentEntityRepo & EstablishmentCounters

// Tour de correction 1 : le détail d'un établissement (spec §6.2 — « services, membres, journal
// d'activité ») — la ligne de la liste, augmentée des trois listes qui font de cet écran l'outil
// de diagnostic (« untel ne voit plus ses patients » se comprend par ses rattachements, pas par
// un compteur seul).
export type EstablishmentServiceRow = {
  id: string
  name: string
  createdAt: Date
  deactivatedAt: Date | null
}

// Un membre de l'établissement, vu depuis l'établissement (symétrique de
// `EstablishmentMembershipRow`, vue depuis le compte). Pas de nom — même principe que
// `FirstAdmin` : l'adresse suffit, elle est déjà une donnée personnelle.
export type EstablishmentMemberRow = {
  id: string
  email: string
  role: EstablishmentRole
  createdAt: Date
  deactivatedAt: Date | null
}

export type EstablishmentDetail = EstablishmentListRow & {
  services: EstablishmentServiceRow[]
  members: EstablishmentMemberRow[]
  activityLog: ActivityLogEntityRepo[]
}

// Rattachement brut d'un compte (recherche d'un compte, tâche 7) : ni l'e-mail ni aucune donnée
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
  // contexte de tenant, rien à encadrer ici. `client` optionnel (tâche 6, tour de correction 1,
  // Important n°2) : `EstablishmentDomain.createWithFirstAdmin` fournit le client de la
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
  // Tâche 7 : lecture nue, sans contexte — `Establishment` est global (spec §4.1).
  findAll: () => Promise<EstablishmentEntityRepo[]>
  findByIdOrThrow: (id: string) => Promise<EstablishmentEntityRepo>
  findManyByIds: (ids: string[]) => Promise<EstablishmentEntityRepo[]>
  // Les quatre compteurs et signaux de la liste/du détail (spec §3.3), pour un établissement —
  // voir le commentaire sur `EstablishmentCounters`.
  countersFor: (establishmentId: string) => Promise<EstablishmentCounters>
  // Tous les rattachements d'UN compte, tous établissements confondus (recherche d'un compte,
  // spec §3.4). `EstablishmentMembership` est un modèle d'établissement : passe par le contexte
  // `superadmin`.
  membershipsForUser: (userId: string) => Promise<EstablishmentMembershipRow[]>
  // Le détail d'un établissement (spec §6.2, tour de correction 1) : services, membres, journal.
  servicesFor: (establishmentId: string) => Promise<EstablishmentServiceRow[]>
  membersFor: (establishmentId: string) => Promise<EstablishmentMemberRow[]>
  // Bornée (voir l'implémentation pour la limite) : cet écran est un diagnostic, pas un export
  // complet — `ActivityLog.findMany` est déclaré sans limite de page dans SUPERADMIN_OPERATIONS,
  // la borne est prise ici, côté appelant.
  activityLogFor: (establishmentId: string) => Promise<ActivityLogEntityRepo[]>
}

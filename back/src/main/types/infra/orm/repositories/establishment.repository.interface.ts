import type {
  Establishment,
  EstablishmentMembership,
} from '../../../../../generated/client'
import type { EstablishmentRole } from '../../../../../generated/enums'
import type { PrimaTransactionClient } from '../client'

export type EstablishmentEntityRepo = Establishment

// Tâche 7 (étape 4a) : le premier administrateur ENCORE actif — pas nécessairement le tout
// premier historiquement. Nul quand l'établissement n'a aucun administrateur actif, ce qui
// arrive si le seul (ou tous) ont été désactivés depuis (consigne du brief, task-7-brief.md).
// Volontairement réduit à l'identifiant et l'adresse : pas de nom, l'adresse suffit à joindre et
// porte déjà une donnée personnelle — même principe de divulgation bornée que §3.3 de la spec.
export type FirstAdmin = { id: string; email: string } | null

// Les quatre compteurs et signaux de la liste du super-admin (spec §3.3), pour UN
// établissement. Chaque lecture d'un modèle d'établissement (Service, EstablishmentMembership,
// Patient) passe par le contexte `superadmin` (SUPERADMIN_OPERATIONS, tâche 1) ; `firstAdmin` et
// `lastAccessAt` retombent sur `User`, un modèle global, joint EN MÉMOIRE — jamais par un
// `include` — voir le commentaire au-dessus de `SUPERADMIN_OPERATIONS` (tenant-guard.ts) pour le
// contournement sûr que ceci applique.
export type EstablishmentCounters = {
  serviceCount: number
  accountCount: number
  patientCount: number
  firstAdmin: FirstAdmin
  lastAccessAt: Date | null
}

export type EstablishmentListRow = EstablishmentEntityRepo & EstablishmentCounters

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
}

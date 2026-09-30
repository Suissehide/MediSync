import type {
  Establishment,
  EstablishmentMembership,
  Service,
  ServiceMembership,
  User,
} from '../../../../../generated/client'
import type { PrimaTransactionClient } from '../client'

export type UserEntityRepo = User
export type UserWithMemberships = User & {
  establishmentMemberships: (EstablishmentMembership & {
    establishment: Establishment & { services: Service[] }
    serviceMemberships: (ServiceMembership & { service: Service })[]
  })[]
}
export type UserCreateEntityRepo = {
  email: string
  password: string
  firstName?: string
  lastName?: string
}
export type UserProfileUpdateRepo = { firstName?: string; lastName?: string }

export interface UserRepositoryInterface {
  findByID: (userId: string) => Promise<UserWithMemberships>
  // Tache 15 (etape 4a) : la ligne `User` SEULE, sans l'arbre des appartenances — voir le
  // commentaire sur l'implementation. `findByID` reste pour le chemin de CONNEXION, qui a besoin
  // de cet arbre et n'a aucun contexte de tenant ; sous un contexte de tenant, c'est celle-ci
  // qu'il faut, l'autre franchissant un pont que le garde-fou refuse desormais.
  findIdentity: (userID: string) => Promise<UserEntityRepo>
  findByEmail: (email: string) => Promise<UserEntityRepo>
  // `client` optionnel (étape 4a, tâche 6, tour de correction 1) : voir le commentaire équivalent
  // sur `AccessLinkRepositoryInterface`.
  create: (
    user: UserCreateEntityRepo,
    client?: PrimaTransactionClient,
  ) => Promise<UserEntityRepo>
  updateProfile: (
    userID: string,
    params: UserProfileUpdateRepo,
  ) => Promise<UserEntityRepo>
  updatePassword: (userID: string, password: string) => Promise<void>
  // `client` optionnel (tâche 11, étape 4a, tour de correction 1) : voir le commentaire sur
  // `grantSuperAdmin` ci-dessous — les deux partagent une transaction depuis
  // `UserDomain.bootstrapSuperAdmin`.
  setDeactivated: (
    userID: string,
    at: Date | null,
    client?: PrimaTransactionClient,
  ) => Promise<UserEntityRepo>
  // Tâche 7 (étape 4a) : posée à la connexion réussie (`AuthDomain.signIn`) — sans elle, la
  // liste du super-admin affiche « jamais » pour tout le monde (spec §3.3, colonne « dernier
  // accès »). `User` est global : aucun contexte de tenant à fournir, comme les méthodes
  // voisines ci-dessus.
  recordLogin: (userID: string, at: Date) => Promise<void>
  // Tâche 11 (étape 4a) : SEUL point d'écriture de `User.isSuperAdmin` — aucune route n'en a un
  // (délibéré). N'existe qu'en sens « pose », jamais « retire » : voir `UserDomain.
  // bootstrapSuperAdmin`, seul appelant, invoqué par `scripts/bootstrap-super-admin.ts`. `client`
  // optionnel (tour de correction 1, Important n°1) : `bootstrapSuperAdmin` l'appelle sous
  // transaction avec `setDeactivated` et l'écriture d'`ActivityLog`, pour qu'une promotion ne
  // puisse jamais survivre seule à l'échec de sa ligne de journal.
  grantSuperAdmin: (
    userID: string,
    client?: PrimaTransactionClient,
  ) => Promise<UserEntityRepo>
}

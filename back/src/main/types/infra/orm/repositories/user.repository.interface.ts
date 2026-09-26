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
    establishment: Establishment
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
  setDeactivated: (userID: string, at: Date | null) => Promise<UserEntityRepo>
  // Tâche 7 (étape 4a) : posée à la connexion réussie (`AuthDomain.signIn`) — sans elle, la
  // liste du super-admin affiche « jamais » pour tout le monde (spec §3.3, colonne « dernier
  // accès »). `User` est global : aucun contexte de tenant à fournir, comme les méthodes
  // voisines ci-dessus.
  recordLogin: (userID: string, at: Date) => Promise<void>
  // Tâche 11 (étape 4a) : SEUL point d'écriture de `User.isSuperAdmin` — aucune route n'en a un
  // (délibéré). N'existe qu'en sens « pose », jamais « retire » : voir `UserDomain.
  // bootstrapSuperAdmin`, seul appelant, invoqué par `scripts/bootstrap-super-admin.ts`.
  grantSuperAdmin: (userID: string) => Promise<UserEntityRepo>
}

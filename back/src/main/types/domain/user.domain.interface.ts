import type { EstablishmentRole } from '../../../generated/enums'
import type {
  UserEntityRepo,
  UserWithMemberships,
} from '../infra/orm/repositories/user.repository.interface'

export type UserEntityDomain = UserWithMemberships
export type UserProfileUpdateDomain = { firstName?: string; lastName?: string }
export type PasswordChangeDomain = {
  currentPassword: string
  newPassword: string
}

// Recherche d'un compte (spec §3.4, tâche 7) : « untel ne voit plus ses patients » se diagnostique
// avec des rattachements et des dates, jamais un contenu de dossier. Volontairement réduit à
// l'e-mail (pas de nom, même principe que `FirstAdmin` — voir establishment.repository.
// interface.ts) et aux colonnes qui répondent à cette question précise.
export type AccountMembership = {
  establishmentId: string
  establishmentName: string
  role: EstablishmentRole
  createdAt: Date
}
export type AccountSearchResult = {
  id: string
  email: string
  deactivatedAt: Date | null
  lastLoginAt: Date | null
  memberships: AccountMembership[]
}

export interface UserDomainInterface {
  findByID: (userID: string) => Promise<UserEntityDomain>
  updateProfile: (
    userID: string,
    params: UserProfileUpdateDomain,
  ) => Promise<UserEntityRepo>
  changePassword: (
    userID: string,
    params: PasswordChangeDomain,
  ) => Promise<void>
  // Tâche 7 : rattachements, rôles, désactivations et dernier accès d'UN compte — jamais de
  // donnée de patient (spec §3.4). `Boom.notFound` (via `UserRepository.findByEmail`) si
  // l'adresse est inconnue.
  searchByEmail: (email: string) => Promise<AccountSearchResult>
}

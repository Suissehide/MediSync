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
// avec des rattachements et des dates, jamais un contenu de dossier. Le nom est visible (tour de
// correction 2, arbitrage de Léo — voir le commentaire sur `FirstAdmin`, establishment.
// repository.interface.ts) : un nom de collègue n'est pas une donnée de santé, et le diagnostic
// de support en a besoin.
export type AccountMembership = {
  establishmentId: string
  establishmentName: string
  role: EstablishmentRole
  createdAt: Date
}
export type AccountSearchResult = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
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
  // LA SOUPAPE (tâche 10, tour de correction 1, arbitrage n°3). Réémet le lien d'accès d'un
  // compte quel que soit le nombre d'établissements auxquels il appartient : c'est précisément
  // ce que la garde du jeton interdit au niveau établissement
  // (`MembershipDomain.assertIssuableToken`), et que seul le super-admin peut faire. Lève
  // `Boom.notFound` si le compte est inconnu, `Boom.conflict` s'il est désactivé (un lien émis
  // pour un compte désactivé ne pourrait jamais être consommé).
  reissueAccessLink: (
    userID: string,
    issuedBy: string,
  ) => Promise<{ token: string }>
}

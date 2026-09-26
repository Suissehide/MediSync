import type { EstablishmentRole } from '../../../generated/enums'
import type {
  MembershipRow,
  MembershipUpdateRepo,
  ServiceAssignment,
} from '../infra/orm/repositories/membership.repository.interface'

// Miroir des types du repository : le domaine n'ajoute ni ne retire de
// colonne, il ajoute les règles métier (dernier administrateur, soi-même).
export type MembershipRowDomain = MembershipRow
export type ServiceAssignmentDomain = ServiceAssignment
export type MembershipUpdateDomain = MembershipUpdateRepo
export type MembershipAddByEmailDomain = {
  email: string
  role: EstablishmentRole
  soignantId: string | null
  services: ServiceAssignment[]
}

// Tâche 10, step 1 : créer un compte de membre. `addByEmail` rattache une adresse DÉJÀ pourvue
// d'un compte ; celle-ci crée le compte s'il n'existe pas, et se contente de le rattacher s'il
// existe — jamais d'écrasement (ni le nom, ni le mot de passe), même leçon qu'à la tâche 6.
export type MembershipCreateAccountDomain = MembershipAddByEmailDomain & {
  firstName?: string
  lastName?: string
}

// Le jeton en clair, rendu une seule fois — voir `AccessLinkDomainInterface.issue`.
// `member` est la ligne COMPLÈTE ; c'est la route qui la projette sur les seules colonnes que
// l'appelant vient d'écrire (voir `createMemberAccountResponseSchema`), pour qu'aucune valeur
// STOCKÉE d'un compte préexistant ne serve d'oracle d'existence.
export type MembershipCreateAccountResult = {
  member: MembershipRowDomain
  accessLink: { token: string }
}

export interface MembershipDomainInterface {
  findAll: () => Promise<MembershipRowDomain[]>
  addByEmail: (
    params: MembershipAddByEmailDomain,
  ) => Promise<MembershipRowDomain>
  update: (
    id: string,
    params: MembershipUpdateDomain,
  ) => Promise<MembershipRowDomain>
  remove: (id: string) => Promise<void>
  setDeactivated: (
    id: string,
    deactivated: boolean,
  ) => Promise<MembershipRowDomain>
  // Le compte, son rattachement et son lien partagent un seul sort (une transaction Postgres).
  // Lève `Boom.conflict` SANS RIEN ÉCRIRE si l'adresse désigne un compte déjà membre de cet
  // établissement, ou un compte désactivé — un lien émis pour un compte désactivé ne pourrait
  // jamais être consommé (`AccessLinkDomain.consume`), et la route rendrait 201 sur un accès
  // inutilisable.
  createAccount: (
    params: MembershipCreateAccountDomain,
  ) => Promise<MembershipCreateAccountResult>
  // Tâche 10, step 3 : réémettre le lien d'un membre existant (réinitialisation d'un accès
  // oublié). `id` est un `membershipId`, chargé par un repository filtré sur l'établissement
  // courant — JAMAIS un `userId` reçu du client : un lien réinitialise le mot de passe du
  // `User`, qui est GLOBAL. Lève `Boom.conflict` si le compte appartient à plusieurs
  // établissements (l'administrateur d'ici prendrait le contrôle de son accès ailleurs) ou
  // s'il est désactivé (le lien ne pourrait jamais être consommé).
  reissueAccessLink: (id: string) => Promise<{ token: string }>
}

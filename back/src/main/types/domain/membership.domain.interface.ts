import type { EstablishmentRole, ServiceRole } from '../../../generated/enums'
import type {
  MembershipRow,
  MembershipUpdateRepo,
  ServiceAssignment,
  ServiceMemberRow,
} from '../infra/orm/repositories/membership.repository.interface'

// Miroir des types du repository : le domaine n'ajoute ni ne retire de
// colonne, il ajoute les règles métier (dernier administrateur, soi-même).
export type MembershipRowDomain = MembershipRow
export type ServiceAssignmentDomain = ServiceAssignment
export type MembershipUpdateDomain = MembershipUpdateRepo
export type MembershipAddByEmailDomain = {
  email: string
  role: EstablishmentRole
  services: ServiceAssignment[]
}

// Inviter un membre : crée le compte s'il n'existe pas, le rattache s'il existe — jamais
// d'écrasement (ni le nom, ni le mot de passe). Un compte déjà en poste ailleurs est rattaché
// sans lien (`accessLink: null`) et prévenu par e-mail.
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
  accessLink: { token: string } | null
}

export type ServiceMemberRowDomain = ServiceMemberRow

// Inviter dans le SERVICE courant : le service n'est jamais soumis (il vient du tenant resolu),
// et le role d'etablissement non plus — un coordinateur ne rattache qu'en `MEMBER`.
export type ServiceInviteDomain = {
  email: string
  firstName?: string
  lastName?: string
  role: ServiceRole
  soignantId?: string | null
}

// `accessLink` a `null` quand le compte etait deja rattache a l'etablissement : il a son mot de
// passe, il n'y a aucun lien a transmettre. Rien d'autre n'est rendu — voir `inviteToService`.
export type ServiceInviteResult = { accessLink: { token: string } | null }

export interface MembershipDomainInterface {
  findServiceMembers: () => Promise<ServiceMemberRowDomain[]>
  setServiceSoignant: (
    serviceMembershipId: string,
    soignantId: string | null,
  ) => Promise<ServiceMemberRowDomain>
  inviteToService: (params: ServiceInviteDomain) => Promise<ServiceInviteResult>
  // Le soignant que le membre connecte incarne dans le service courant. 404 sans affectation.
  setOwnServiceSoignant: (
    soignantId: string | null,
  ) => Promise<ServiceMemberRowDomain>
  // Leve `Boom.conflict` sur sa propre affectation : un coordinateur ne se retrograde pas, et ne
  // se retire pas de son service.
  setServiceMemberRole: (
    serviceMembershipId: string,
    role: ServiceRole,
  ) => Promise<ServiceMemberRowDomain>
  removeServiceMember: (serviceMembershipId: string) => Promise<void>
  findAll: () => Promise<MembershipRowDomain[]>
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
  // Réémettre le lien d'un membre existant (réinitialisation d'un accès
  // oublié). `id` est un `membershipId`, chargé par un repository filtré sur l'établissement
  // courant — JAMAIS un `userId` reçu du client : un lien réinitialise le mot de passe du
  // `User`, qui est GLOBAL. Lève `Boom.conflict` si le compte appartient à plusieurs
  // établissements (l'administrateur d'ici prendrait le contrôle de son accès ailleurs) ou
  // s'il est désactivé (le lien ne pourrait jamais être consommé).
  reissueAccessLink: (id: string) => Promise<{ token: string }>
}

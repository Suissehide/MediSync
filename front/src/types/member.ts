import type { EstablishmentRole, ServiceRole } from './auth.ts'

// Un membre est le rattachement d'un compte utilisateur à l'établissement.
// Le rôle d'établissement (administrateur ou membre) et les rôles de
// service (un par service auquel le compte est affecté) sont deux choses
// distinctes et se règlent séparément : voir `serviceMemberships`.
export type MemberServiceAssignment = {
  serviceId: string
  role: ServiceRole
}

export type InvitationStatus = 'pending' | 'expired' | null

export type Member = {
  id: string
  role: EstablishmentRole
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    deactivatedAt: string | null
    // Jamais connecté : invitation en attente, ou expirée faute de lien encore valide.
    invitationStatus: InvitationStatus
    // Fin du délai de 5 minutes entre deux renvois ; null si le renvoi est possible.
    invitationResendableAt: string | null
  }
  serviceMemberships: MemberServiceAssignment[]
}

export type UpdateMemberInput = {
  id: string
  role?: EstablishmentRole
  services?: MemberServiceAssignment[]
}

// `POST /e/:establishmentId/admin/members/account` : invite un membre. Crée
// le compte s'il n'existe pas et rend son lien de première connexion ; un
// compte déjà en poste dans un autre établissement est rattaché sans lien.
export type CreateMemberAccountInput = {
  email: string
  firstName?: string
  lastName?: string
  role: EstablishmentRole
  services: MemberServiceAssignment[]
}

// VOLONTAIREMENT PLUS PAUVRE que `Member` : pas de bloc `user` (voir le
// commentaire de `createMemberAccountResponseSchema`, back). Le jeton en
// clair (`accessLink.token`) est un mot de passe à usage unique — voir
// `createMemberAccountForm.tsx`, qui ne l'écrit jamais ailleurs qu'à
// l'écran.
export type CreateMemberAccountResult = {
  member: {
    id: string
    role: EstablishmentRole
    serviceMemberships: MemberServiceAssignment[]
  }
  accessLink: { token: string } | null
}

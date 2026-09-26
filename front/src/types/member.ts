import type { EstablishmentRole, ServiceRole } from './auth.ts'

// Un membre est le rattachement d'un compte utilisateur à l'établissement.
// Le rôle d'établissement (administrateur ou membre) et les rôles de
// service (un par service auquel le compte est affecté) sont deux choses
// distinctes et se règlent séparément : voir `serviceMemberships`.
export type MemberServiceAssignment = {
  serviceId: string
  role: ServiceRole
}

export type Member = {
  id: string
  role: EstablishmentRole
  soignantId: string | null
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    deactivatedAt: string | null
  }
  serviceMemberships: MemberServiceAssignment[]
}

export type AddMemberInput = {
  email: string
  role: EstablishmentRole
  soignantId: string | null
  services: MemberServiceAssignment[]
}

export type UpdateMemberInput = {
  id: string
  role?: EstablishmentRole
  soignantId?: string | null
  services?: MemberServiceAssignment[]
}

// `POST /e/:establishmentId/admin/members/account` (tâche 13, step 3) : crée
// un compte de membre (adresse sans compte existant) et rend son lien de
// première connexion. Distinct de `AddMemberInput` : celui-ci rattache un
// compte qui existe déjà (voir `addMemberForm.tsx`), celui-là en crée un.
export type CreateMemberAccountInput = {
  email: string
  firstName?: string
  lastName?: string
  role: EstablishmentRole
  soignantId: string | null
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
    soignantId: string | null
    serviceMemberships: MemberServiceAssignment[]
  }
  accessLink: { token: string }
}

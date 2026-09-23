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

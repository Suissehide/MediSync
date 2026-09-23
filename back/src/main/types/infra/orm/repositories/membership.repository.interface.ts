import type {
  EstablishmentMembership,
  ServiceMembership,
  User,
} from '../../../../../generated/client'
import type {
  EstablishmentRole,
  ServiceRole,
} from '../../../../../generated/enums'

// Une appartenance telle que la manipule la gestion des membres : la ligne
// EstablishmentMembership, l'identité qu'elle rattache (jamais le mot de
// passe ni le sel) et les affectations de service déjà aplaties.
export type MembershipRow = EstablishmentMembership & {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'deactivatedAt'>
  serviceMemberships: Pick<ServiceMembership, 'serviceId' | 'role'>[]
}

export type ServiceAssignment = { serviceId: string; role: ServiceRole }

// Le repository pose establishmentId (tenant) lui-même : l'appelant ne le
// fournit pas. `serviceMemberships` (la relation brute Prisma) est remplacée
// par `services`, converti en écriture imbriquée par le repository.
export type MembershipCreateRepo = {
  userId: string
  role: EstablishmentRole
  soignantId: string | null
  services: ServiceAssignment[]
}
export type MembershipUpdateRepo = {
  role?: EstablishmentRole
  soignantId?: string | null
  services?: ServiceAssignment[]
}

export interface MembershipRepositoryInterface {
  findAll: () => Promise<MembershipRow[]>
  findByID: (id: string) => Promise<MembershipRow>
  findByUserID: (userId: string) => Promise<MembershipRow | null>
  countAdmins: () => Promise<number>
  create: (params: MembershipCreateRepo) => Promise<MembershipRow>
  update: (id: string, params: MembershipUpdateRepo) => Promise<MembershipRow>
  delete: (id: string) => Promise<void>
  serviceExists: (serviceId: string) => Promise<boolean>
}

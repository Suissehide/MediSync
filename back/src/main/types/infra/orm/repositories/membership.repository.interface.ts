import type {
  EstablishmentMembership,
  ServiceMembership,
  User,
} from '../../../../../generated/client'
import type {
  EstablishmentRole,
  ServiceRole,
} from '../../../../../generated/enums'
import type { PrimaTransactionClient } from '../client'

// Une appartenance telle que la manipule la gestion des membres : la ligne
// EstablishmentMembership, l'identité qu'elle rattache (jamais le mot de
// passe ni le sel) et les affectations de service déjà aplaties.
export type MembershipRow = EstablishmentMembership & {
  user: Pick<
    User,
    'id' | 'email' | 'firstName' | 'lastName' | 'deactivatedAt' | 'lastLoginAt'
  >
  serviceMemberships: Pick<ServiceMembership, 'serviceId' | 'role'>[]
}

export type ServiceAssignment = {
  serviceId: string
  role: ServiceRole
  soignantId?: string | null
}

// Le repository pose establishmentId (tenant) lui-même : l'appelant ne le
// fournit pas. `serviceMemberships` (la relation brute Prisma) est remplacée
// par `services`, converti en écriture imbriquée par le repository.
export type MembershipCreateRepo = {
  userId: string
  role: EstablishmentRole
  services: ServiceAssignment[]
}
export type MembershipUpdateRepo = {
  role?: EstablishmentRole
  services?: ServiceAssignment[]
}

// Un membre d'UN service, vu depuis ce service (2026-09-29) : son affectation, son role et le
// soignant qu'il incarne ici. L'identite du compte n'y figure que pour l'afficher.
export type ServiceMemberRow = {
  id: string
  establishmentMembershipId: string
  role: ServiceRole
  soignantId: string | null
  establishmentMembership: {
    user: {
      id: string
      email: string
      firstName: string | null
      lastName: string | null
      deactivatedAt: Date | null
      lastLoginAt: Date | null
    }
  }
}

export interface MembershipRepositoryInterface {
  // Sous le contexte de SERVICE : les affectations du service courant.
  findServiceMembers: () => Promise<ServiceMemberRow[]>
  // Sous le contexte de SERVICE : pose le soignant d'une affectation du service courant. `null`
  // si l'affectation n'est pas de ce service (le domaine en fait un 404).
  setServiceSoignant: (
    serviceMembershipId: string,
    soignantId: string | null,
  ) => Promise<ServiceMemberRow | null>
  // Sous le contexte de SERVICE : une affectation du service courant, par son id. `null` si elle
  // appartient a un autre service (le domaine en fait un 404).
  findServiceMemberByID: (
    serviceMembershipId: string,
  ) => Promise<ServiceMemberRow | null>
  // Sous le contexte de SERVICE : l'affectation de cette appartenance d'etablissement au service
  // courant, si elle existe.
  findServiceMemberByMembership: (
    establishmentMembershipId: string,
  ) => Promise<ServiceMemberRow | null>
  // Sous le contexte de SERVICE : affecte une appartenance d'etablissement au service courant.
  // N'ajoute QU'une affectation — contrairement a `update`, qui remplace la liste entiere.
  addServiceMember: (
    establishmentMembershipId: string,
    role: ServiceRole,
    soignantId?: string | null,
    client?: PrimaTransactionClient,
  ) => Promise<ServiceMemberRow>
  // Sous le contexte de SERVICE : le role d'une affectation du service courant.
  setServiceRole: (
    serviceMembershipId: string,
    role: ServiceRole,
  ) => Promise<ServiceMemberRow | null>
  // Sous le contexte de SERVICE : retire une affectation du service courant, sans toucher au
  // rattachement d'etablissement ni aux autres services.
  deleteServiceMember: (serviceMembershipId: string) => Promise<void>
  findAll: () => Promise<MembershipRow[]>
  findByID: (id: string) => Promise<MembershipRow>
  findByUserID: (userId: string) => Promise<MembershipRow | null>
  countAdmins: () => Promise<number>
  // « ce compte est-il rattache a un AUTRE etablissement que le courant ? ».
  // UN BOOLEEN, jamais un identifiant ni un nom — voir l'implementation pour le pourquoi du mode
  // encadre et ce qu'elle remplace (l'arbre complet des appartenances, lu depuis `User`).
  estRattacheAilleurs: (userId: string) => Promise<boolean>
  // `client` optionnel : le rattachement d'un compte fraîchement créé doit
  // partager le sort de la création du compte et de l'émission de son lien.
  create: (
    params: MembershipCreateRepo,
    client?: PrimaTransactionClient,
  ) => Promise<MembershipRow>
  update: (id: string, params: MembershipUpdateRepo) => Promise<MembershipRow>
  delete: (id: string) => Promise<void>
  serviceExists: (serviceId: string) => Promise<boolean>
}

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
  // Tache 15 (etape 4a) : « ce compte est-il rattache a un AUTRE etablissement que le courant ? ».
  // UN BOOLEEN, jamais un identifiant ni un nom — voir l'implementation pour le pourquoi du mode
  // encadre et ce qu'elle remplace (l'arbre complet des appartenances, lu depuis `User`).
  estRattacheAilleurs: (userId: string) => Promise<boolean>
  // `client` optionnel (tâche 10, step 1) : le rattachement d'un compte fraîchement créé doit
  // partager le sort de la création du compte et de l'émission de son lien.
  create: (
    params: MembershipCreateRepo,
    client?: PrimaTransactionClient,
  ) => Promise<MembershipRow>
  update: (id: string, params: MembershipUpdateRepo) => Promise<MembershipRow>
  delete: (id: string) => Promise<void>
  serviceExists: (serviceId: string) => Promise<boolean>
}

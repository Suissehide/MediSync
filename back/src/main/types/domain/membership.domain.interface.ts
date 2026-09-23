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
}

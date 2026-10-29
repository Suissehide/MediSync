import type { Location, Prisma } from '../../../generated/client'
import type { PlanningConflict } from '../../utils/planning-conflicts'
import type {
  SlotDateRangeRepo,
  SlotEntityRepo,
} from '../infra/orm/repositories/slot.repository.interface'
import type { AppointmentWithPatients } from './appointment.domain.interface'
import type { PathwayEntityDomain } from './pathway.domain.interface'
import type { SlotTemplateWithSoignantsDomain } from './slotTemplate.domain.interface'

export type SlotEntityDomain = SlotEntityRepo
export type SlotDateRangeDomain = SlotDateRangeRepo
// `location` : voir le commentaire de SlotDTORepo, dont ce type est le miroir.
export type SlotDTODomain = SlotEntityDomain & {
  pathway: PathwayEntityDomain | null
  slotTemplate: SlotTemplateWithSoignantsDomain & {
    location?: Location | null
  }
  appointments: AppointmentWithPatients[]
}
// Le repository pose serviceId/establishmentId (tenant) lui-même : l'appelant
// ne les fournit pas. `pathwayID` est exclu pour la même raison : voir la note
// de SlotCreateEntityRepo, dont ce type est le miroir.
export type SlotCreateEntityDomain = Omit<
  Prisma.SlotUncheckedCreateInput,
  'appointments' | 'establishmentId' | 'pathwayID' | 'serviceId'
> & {
  slotTemplateID: string
}
export type SlotUpdateEntityDomain = Omit<
  Prisma.SlotUncheckedUpdateInput,
  'appointments' | 'establishmentId' | 'pathwayID' | 'serviceId'
> & {
  slotTemplateID?: string
}

export interface SlotDomainInterface {
  findAll: (dateRange?: SlotDateRangeDomain) => Promise<SlotDTODomain[]>
  findByID: (slotID: string) => Promise<SlotDTODomain>
  create: (slotCreateParams: SlotCreateEntityDomain) => Promise<SlotDTODomain>
  update: (
    slotID: string,
    slotUpdateParams: SlotUpdateEntityDomain,
    userID: string,
  ) => Promise<SlotDTODomain>
  delete: (slotID: string, userID: string) => Promise<SlotEntityDomain>
  findConflicts: (dateRange: {
    from: Date
    to: Date
  }) => Promise<PlanningConflict[]>
  conflictsOf: (slotID: string) => Promise<PlanningConflict[]>
}

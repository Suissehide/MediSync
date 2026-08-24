import type {
  PathwayTemplate,
  Prisma,
  Slot,
} from '../../../../../generated/client'
import type { AppointmentWithPatientsRepo } from './appointment.repository.interface'
import type { PathwayEntityRepo } from './pathway.repository.interface'
import type {
  SlotTemplateUpdateEntityRepo,
  SlotTemplateWithSoignantsRepo,
} from './slotTemplate.repository.interface'

export type SlotEntityRepo = Slot
export type SlotWithTemplateAndAppointmentsRepo = SlotEntityRepo & {
  slotTemplate: SlotTemplateWithSoignantsRepo
  appointments: AppointmentWithPatientsRepo[]
}
export type PathwayWithTemplateRepo = PathwayEntityRepo & {
  template: PathwayTemplate | null
}
export type SlotDTORepo = SlotEntityRepo & {
  pathway: PathwayWithTemplateRepo | null
  slotTemplate: SlotTemplateWithSoignantsRepo
  appointments: AppointmentWithPatientsRepo[]
}
export type SlotCreateEntityRepo = Omit<
  Prisma.SlotUncheckedCreateInput,
  'appointments'
> & {
  pathwayID?: string
  slotTemplateID: string
}
export type SlotUpdateEntityRepo = Omit<
  Prisma.SlotUncheckedUpdateInput,
  'appointments'
> & {
  pathwayID?: string
  slotTemplate?: SlotTemplateUpdateEntityRepo & {
    id?: string
  }
}

export type SlotDateRangeRepo = {
  from?: Date
  to?: Date
}

export interface SlotRepositoryInterface {
  findAll: (dateRange?: SlotDateRangeRepo) => Promise<SlotDTORepo[]>
  findByID: (id: string) => Promise<SlotDTORepo>
  create: (slotCreateParams: SlotCreateEntityRepo) => Promise<SlotDTORepo>
  update: (
    slotID: string,
    slotUpdateParams: SlotUpdateEntityRepo,
  ) => Promise<SlotDTORepo>
  delete: (slotID: string) => Promise<SlotEntityRepo>
}

import type { Slot, Prisma } from '@prisma/client'
import type { PathwayEntityRepo } from './pathway.repository.interface'
import type { AppointmentWithPatientsRepo } from './appointment.repository.interface'
import type {
  SlotTemplateUpdateEntityRepo,
  SlotTemplateWithSoignantRepo,
} from './slotTemplate.repository.interface'

export type SlotEntityRepo = Slot
export type SlotDTORepo = SlotEntityRepo & {
  pathway: PathwayEntityRepo | null
  slotTemplate: SlotTemplateWithSoignantRepo
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

export interface SlotRepositoryInterface {
  findAll: () => Promise<SlotDTORepo[]>
  findByID: (id: string) => Promise<SlotDTORepo>
  create: (slotCreateParams: SlotCreateEntityRepo) => Promise<SlotDTORepo>
  update: (
    slotID: string,
    slotUpdateParams: SlotUpdateEntityRepo,
  ) => Promise<SlotDTORepo>
  delete: (slotID: string) => Promise<SlotEntityRepo>
}

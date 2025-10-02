import type { Prisma } from '@prisma/client'
import type { SlotEntityRepo } from '../infra/orm/repositories/slot.repository.interface'
import type { PathwayEntityDomain } from './pathway.domain.interface'
import type { SlotTemplateWithSoignantDomain } from './slotTemplate.domain.interface'
import type { AppointmentEntityDomain } from './appointment.domain.interface'

export type SlotEntityDomain = SlotEntityRepo
export type SlotDTODomain = SlotEntityDomain & {
  pathway: PathwayEntityDomain | null
  slotTemplate: SlotTemplateWithSoignantDomain
  appointments: AppointmentEntityDomain[]
}
export type SlotCreateEntityDomain = Omit<
  Prisma.SlotUncheckedCreateInput,
  'appointments'
> & {
  pathwayID?: string
  slotTemplateID: string
}
export type SlotUpdateEntityDomain = Omit<
  Prisma.SlotUncheckedUpdateInput,
  'appointments'
> & {
  pathwayID?: string
  slotTemplateID?: string
}

export interface SlotDomainInterface {
  findAll: () => Promise<SlotDTODomain[]>
  findByID: (slotID: string) => Promise<SlotDTODomain>
  create: (slotCreateParams: SlotCreateEntityDomain) => Promise<SlotDTODomain>
  update: (
    slotID: string,
    slotUpdateParams: SlotUpdateEntityDomain,
  ) => Promise<SlotDTODomain>
  delete: (slotID: string) => Promise<SlotEntityDomain>
}

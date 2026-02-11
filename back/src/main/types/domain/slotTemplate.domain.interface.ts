import type { Prisma } from 'generated/prisma/client'
import type { SlotTemplateEntityRepo } from '../infra/orm/repositories/slotTemplate.repository.interface'
import type { PathwayTemplateEntityDomain } from './pathwayTemplate.domain.interface'
import type { SoignantEntityDomain } from './soignant.domain.interface'

export type SlotTemplateEntityDomain = SlotTemplateEntityRepo
export type SlotTemplateWithSoignantDomain = SlotTemplateEntityRepo & {
  soignant: SoignantEntityDomain | null
}
export type SlotTemplateDTODomain = SlotTemplateEntityDomain & {
  soignant: SoignantEntityDomain | null
  template: PathwayTemplateEntityDomain | null
}
export type SlotTemplateCreateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedCreateInput,
  'slot'
> & {
  soignantID?: string
  templateID?: string
}
export type SlotTemplateUpdateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedUpdateInput,
  'slot'
> & {
  soignantID?: string
  templateID?: string
  slotID?: string
}

export interface SlotTemplateDomainInterface {
  findAll: () => Promise<SlotTemplateDTODomain[]>
  findByID: (slotTemplateID: string) => Promise<SlotTemplateDTODomain>
  create: (
    slotTemplateCreateParams: SlotTemplateCreateEntityDomain,
  ) => Promise<SlotTemplateDTODomain>
  update: (
    slotTemplateID: string,
    slotTemplateUpdateParams: SlotTemplateUpdateEntityDomain,
  ) => Promise<SlotTemplateDTODomain>
  delete: (slotTemplateID: string) => Promise<SlotTemplateDTODomain>
}

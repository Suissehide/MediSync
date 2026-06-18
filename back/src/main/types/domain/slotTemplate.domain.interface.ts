import type { Prisma } from '../../../generated/client'
import type { SlotTemplateEntityRepo } from '../infra/orm/repositories/slotTemplate.repository.interface'
import type { PathwayTemplateEntityDomain } from './pathwayTemplate.domain.interface'
import type { SoignantEntityDomain } from './soignant.domain.interface'

export type SlotTemplateEntityDomain = SlotTemplateEntityRepo
export type SlotTemplateWithSoignantsDomain = SlotTemplateEntityRepo & {
  soignants: SoignantEntityDomain[]
}
export type SlotTemplateDTODomain = SlotTemplateEntityDomain & {
  soignants: SoignantEntityDomain[]
  template: PathwayTemplateEntityDomain | null
}
export type SlotTemplateCreateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedCreateInput,
  'slot'
> & {
  soignantIDs?: string[]
  templateID?: string
}
export type SlotTemplateUpdateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedUpdateInput,
  'slot'
> & {
  soignantIDs?: string[]
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

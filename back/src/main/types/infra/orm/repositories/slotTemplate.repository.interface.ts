import type { Prisma, SlotTemplate } from '../../../../../generated/client'
import type { LocationEntityRepo } from './location.repository.interface'
import type { PathwayTemplateEntityRepo } from './pathwayTemplate.repository.interface'
import type { SoignantEntityRepo } from './soignant.repository.interface'
import type { ThematicEntityRepo } from './thematic.repository.interface'

export type SlotTemplateEntityRepo = SlotTemplate
export type SlotTemplateWithSoignantsRepo = SlotTemplateEntityRepo & {
  soignants: SoignantEntityRepo[]
}
export type SlotTemplateDTORepo = SlotTemplateEntityRepo & {
  soignants: SoignantEntityRepo[]
  template: PathwayTemplateEntityRepo | null
  location: LocationEntityRepo | null
  thematic: ThematicEntityRepo | null
}
// Le repository pose serviceId/establishmentId (tenant) lui-même : l'appelant
// ne les fournit pas.
export type SlotTemplateCreateEntityRepo = Omit<
  Prisma.SlotTemplateUncheckedCreateInput,
  'establishmentId' | 'serviceId'
> & {
  soignantIDs?: string[]
  templateID?: string
}
export type SlotTemplateUpdateEntityRepo = Omit<
  Prisma.SlotTemplateUncheckedUpdateInput,
  'establishmentId' | 'serviceId'
> & {
  soignantIDs?: string[]
  templateID?: string
}

export interface SlotTemplateRepositoryInterface {
  findAll: () => Promise<SlotTemplateDTORepo[]>
  findByID: (id: string) => Promise<SlotTemplateDTORepo>
  create: (
    slotTemplateTemplateCreateParams: SlotTemplateCreateEntityRepo,
  ) => Promise<SlotTemplateDTORepo>
  update: (
    slotTemplateID: string,
    slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
  ) => Promise<SlotTemplateDTORepo>
  updateMany: (
    slotTemplateIDs: string[],
    slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
  ) => Promise<void>
  delete: (slotTemplateID: string) => Promise<SlotTemplateDTORepo>
}

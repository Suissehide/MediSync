import type { Prisma, SlotTemplate } from '@prisma/client'

import type { PathwayTemplateEntityRepo } from './pathwayTemplate.repository.interface'
import type { SoignantEntityRepo } from './soignant.repository.interface'

export type SlotTemplateEntityRepo = SlotTemplate
export type SlotTemplateWithSoignantRepo = SlotTemplateEntityRepo & {
  soignant: SoignantEntityRepo | null
}
export type SlotTemplateDTORepo = SlotTemplateEntityRepo & {
  soignant: SoignantEntityRepo | null
  template: PathwayTemplateEntityRepo | null
}
export type SlotTemplateCreateEntityRepo =
  Prisma.SlotTemplateUncheckedCreateInput & {
    soignantID?: string
    templateID?: string
  }
export type SlotTemplateUpdateEntityRepo =
  Prisma.SlotTemplateUncheckedUpdateInput & {
    soignantID?: string
    templateID?: string
    slot?: string
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

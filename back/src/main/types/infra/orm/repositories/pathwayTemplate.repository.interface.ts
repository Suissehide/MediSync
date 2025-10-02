import type { PathwayTemplate, Prisma } from '@prisma/client'
import type { SlotTemplateWithSoignantRepo } from './slotTemplate.repository.interface'

export type PathwayTemplateEntityRepo = PathwayTemplate
export type PathwayTemplateWithSlotTemplatesRepo = PathwayTemplateEntityRepo & {
  slotTemplates: SlotTemplateWithSoignantRepo[]
}
export type PathwayTemplateCreateEntityRepo = Omit<
  Prisma.PathwayTemplateUncheckedCreateInput,
  'slots' | 'template'
> & {
  slotTemplateIDs: string[]
}
export type PathwayTemplateUpdateEntityRepo = Omit<
  Prisma.PathwayTemplateUncheckedUpdateInput,
  'slots' | 'template'
> & {
  pathwayIDs: string[]
  slotTemplateIDs: string[]
}

export interface PathwayTemplateRepositoryInterface {
  findAll: () => Promise<PathwayTemplateEntityRepo[]>
  findByID: (id: string) => Promise<PathwayTemplateWithSlotTemplatesRepo>
  create: (
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityRepo,
  ) => Promise<PathwayTemplateEntityRepo>
  update: (
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityRepo,
  ) => Promise<PathwayTemplateEntityRepo>
  delete: (pathwayTemplateID: string) => Promise<PathwayTemplateEntityRepo>
}

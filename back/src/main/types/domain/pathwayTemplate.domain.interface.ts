import type { PathwayTemplate, Prisma } from '../../../generated/client'

import type { SlotTemplateWithSoignantDomain } from './slotTemplate.domain.interface'

export type PathwayTemplateEntityDomain = PathwayTemplate
export type PathwayTemplateWithSlotTemplatesDomain =
  PathwayTemplateEntityDomain & {
    slotTemplates: SlotTemplateWithSoignantDomain[]
  }
export type PathwayTemplateCreateEntityDomain = Omit<
  Prisma.PathwayTemplateUncheckedCreateInput,
  'pathways' | 'slotTemplates'
> & {
  slotTemplateIDs?: string[]
}
export type PathwayTemplateUpdateEntityDomain = Omit<
  Prisma.PathwayTemplateUncheckedUpdateInput,
  'pathways' | 'slotTemplates'
> & {
  pathwayIDs?: string[]
  slotTemplateIDs?: string[]
}

export interface PathwayTemplateDomainInterface {
  findAll: () => Promise<PathwayTemplateEntityDomain[]>
  findByID: (
    pathwayTemplateID: string,
  ) => Promise<PathwayTemplateWithSlotTemplatesDomain>
  create: (
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityDomain,
  ) => Promise<PathwayTemplateEntityDomain>
  update: (
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityDomain,
  ) => Promise<PathwayTemplateEntityDomain>
  delete: (pathwayTemplateID: string) => Promise<PathwayTemplateEntityDomain>
}

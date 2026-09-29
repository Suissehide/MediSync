import type { PathwayTemplate, Prisma } from '../../../generated/client'
import type { SlotTemplateWithSoignantsDomain } from './slotTemplate.domain.interface'

export type PathwayTemplateEntityDomain = PathwayTemplate
export type PathwayTemplateWithSlotTemplatesDomain =
  PathwayTemplateEntityDomain & {
    slotTemplates: SlotTemplateWithSoignantsDomain[]
  }
// Le repository pose serviceId/establishmentId (tenant) lui-même : l'appelant
// ne les fournit pas. Miroir de PathwayTemplateCreateEntityRepo/…UpdateEntityRepo.
export type PathwayTemplateCreateEntityDomain = Omit<
  Prisma.PathwayTemplateUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'pathways' | 'slotTemplates'
> & {
  slotTemplateIDs?: string[]
  secondaryTags?: string[]
}
export type PathwayTemplateUpdateEntityDomain = Omit<
  Prisma.PathwayTemplateUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'pathways' | 'slotTemplates'
> & {
  pathwayIDs?: string[]
  slotTemplateIDs?: string[]
  secondaryTags?: string[]
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
  reorder: (orderedIds: string[]) => Promise<void>
}

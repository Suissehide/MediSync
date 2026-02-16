import type { Pathway, PathwayTemplate, Prisma, Slot } from '../../../generated/client'

export type PathwayEntityDomain = Pathway
export type PathwayWithTemplateAndSlotsDomain = PathwayEntityDomain & {
  template: PathwayTemplate | null
  slots: Slot[]
}
export type PathwayCreateEntityDomain = Omit<
  Prisma.PathwayUncheckedCreateInput,
  'slots' | 'template'
> & {
  templateID?: string
  slotIDs: string[]
}
export type PathwayUpdateEntityDomain = Omit<
  Prisma.PathwayUncheckedUpdateInput,
  'slots' | 'template'
> & {
  templateID?: string
  slotIDs: string[]
}

export interface PathwayDomainInterface {
  findAll: () => Promise<PathwayWithTemplateAndSlotsDomain[]>
  findByID: (pathwayID: string) => Promise<PathwayEntityDomain>
  create: (
    pathwayCreateParams: PathwayCreateEntityDomain,
  ) => Promise<PathwayEntityDomain>
  update: (
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityDomain,
  ) => Promise<PathwayEntityDomain>
  delete: (pathwayID: string) => Promise<PathwayEntityDomain>
}

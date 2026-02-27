import type { Pathway, PathwayTemplate, Prisma, Slot } from '../../../generated/client'
import type { TrackingPathwayRepo } from '../infra/orm/repositories/pathway.repository.interface'

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
export type TrackingPathwayDomain = TrackingPathwayRepo

export interface PathwayDomainInterface {
  findAll: () => Promise<PathwayWithTemplateAndSlotsDomain[]>
  findByID: (pathwayID: string) => Promise<PathwayEntityDomain>
  findTracking: (
    year: number,
    month: number,
  ) => Promise<TrackingPathwayDomain[]>
  create: (
    pathwayCreateParams: PathwayCreateEntityDomain,
  ) => Promise<PathwayEntityDomain>
  update: (
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityDomain,
  ) => Promise<PathwayEntityDomain>
  delete: (pathwayID: string) => Promise<PathwayEntityDomain>
}

import type { Pathway, PathwayTemplate, Prisma, Slot } from '../../../generated/client'
import type {
  RegeneratePathwaysResultRepo,
  TrackingPathwayRepo,
} from '../infra/orm/repositories/pathway.repository.interface'

export type PathwayEntityDomain = Pathway
export type PathwayWithTemplateAndSlotsDomain = PathwayEntityDomain & {
  template: PathwayTemplate | null
  slots: Slot[]
}
// Le repository pose serviceId/establishmentId (tenant) lui-même : l'appelant
// ne les fournit pas. Miroir de PathwayCreateEntityRepo/PathwayUpdateEntityRepo.
export type PathwayCreateEntityDomain = Omit<
  Prisma.PathwayUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'slots' | 'template'
> & {
  templateID?: string
  slotIDs: string[]
}
export type PathwayUpdateEntityDomain = Omit<
  Prisma.PathwayUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'slots' | 'template'
> & {
  templateID?: string
  slotIDs: string[]
}
export type TrackingPathwayDomain = TrackingPathwayRepo
export type RegeneratePathwaysResultDomain = RegeneratePathwaysResultRepo

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
  regenerate: (
    pathwayTemplateID: string,
    fromDate: Date,
  ) => Promise<RegeneratePathwaysResultDomain>
}

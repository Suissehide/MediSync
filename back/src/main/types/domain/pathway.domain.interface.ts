import type { Pathway, Prisma } from '@prisma/client'

export type PathwayEntityDomain = Pathway
export type PathwayCreateEntityDomain = Prisma.PathwayUncheckedCreateInput
export type PathwayUpdateEntityDomain = Prisma.PathwayUncheckedUpdateInput

export interface PathwayDomainInterface {
  findAll: () => Promise<PathwayEntityDomain[]>
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

import type { Pathway, Prisma } from '@prisma/client'

export type PathwayEntityRepo = Pathway
export type PathwayCreateEntityRepo = Prisma.PathwayUncheckedCreateInput
export type PathwayUpdateEntityRepo = Prisma.PathwayUncheckedUpdateInput

export interface PathwayRepositoryInterface {
  findAll: () => Promise<PathwayEntityRepo[]>
  findByID: (id: string) => Promise<PathwayEntityRepo>
  create: (
    pathwayCreateParams: PathwayCreateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  update: (
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  delete: (pathwayID: string) => Promise<PathwayEntityRepo>
}

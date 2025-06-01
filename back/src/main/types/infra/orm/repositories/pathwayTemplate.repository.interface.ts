import type { PathwayTemplate, Prisma } from '@prisma/client'

export type PathwayTemplateEntityRepo = PathwayTemplate
export type PathwayTemplateCreateEntityRepo =
  Prisma.PathwayTemplateUncheckedCreateInput
export type PathwayTemplateUpdateEntityRepo =
  Prisma.PathwayTemplateUncheckedUpdateInput

export interface PathwayTemplateRepositoryInterface {
  findAll: () => Promise<PathwayTemplateEntityRepo[]>
  findByID: (id: string) => Promise<PathwayTemplateEntityRepo>
  create: (
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityRepo,
  ) => Promise<PathwayTemplateEntityRepo>
  update: (
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityRepo,
  ) => Promise<PathwayTemplateEntityRepo>
  delete: (pathwayTemplateID: string) => Promise<PathwayTemplateEntityRepo>
}

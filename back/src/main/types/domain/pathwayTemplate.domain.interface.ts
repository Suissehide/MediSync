import type { PathwayTemplate, Prisma } from '@prisma/client'

export type PathwayTemplateEntityDomain = PathwayTemplate
export type PathwayTemplateCreateEntityDomain =
  Prisma.PathwayTemplateUncheckedCreateInput
export type PathwayTemplateUpdateEntityDomain =
  Prisma.PathwayTemplateUncheckedUpdateInput

export interface PathwayTemplateDomainInterface {
  findAll: () => Promise<PathwayTemplateEntityDomain[]>
  findByID: (pathwayTemplateID: string) => Promise<PathwayTemplateEntityDomain>
  create: (
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityDomain,
  ) => Promise<PathwayTemplateEntityDomain>
  update: (
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityDomain,
  ) => Promise<PathwayTemplateEntityDomain>
  delete: (pathwayTemplateID: string) => Promise<PathwayTemplateEntityDomain>
}

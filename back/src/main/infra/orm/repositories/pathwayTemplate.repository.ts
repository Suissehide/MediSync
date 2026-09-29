import type { PathwayTemplate } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PathwayTemplateCreateEntityRepo,
  PathwayTemplateRepositoryInterface,
  PathwayTemplateUpdateEntityRepo,
  PathwayTemplateWithSlotTemplatesRepo,
} from '../../../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import {
  flattenSlotTemplate,
  soignantLinksInclude,
} from '../includes/slot-template.include'
import type { PostgresPrismaClient } from '../postgres-client'

// `location` et `thematic` sont chacune référencées depuis SlotTemplate par
// une clé étrangère scalaire simple (`locationID`, `thematicId`) : sûres
// pour la même raison que documentée dans slot-template.include.ts (relation
// à un seul enregistrement, id déjà porté par une ligne SlotTemplate
// elle-même toujours lue via une requête filtrée par service). `template`
// n'est volontairement pas incluse ici — inutile, on part déjà de la
// PathwayTemplate propriétaire.
//
// `slotTemplates` (la liste elle-même) mérite une note à part : c'est une
// relation *inverse* (PathwayTemplate → SlotTemplate) portée par le même FK
// scalaire `templateID` (pas de clé composite avec serviceId). Elle est sûre
// aujourd'hui parce que la seule voie déclarée pour rattacher un SlotTemplate
// à une PathwayTemplate passe par `create`/`update` ci-dessous, qui
// connectent par clé composite `id_serviceId` (donc un SlotTemplate d'un
// autre service ne peut pas être rattaché par ce chemin). Mais
// SlotTemplateRepository (tâche 11) accepte aussi `templateID` en scalaire
// brut sur `create`/`update`, sans vérification de service : si ce chemin
// est utilisé pour écrire un `templateID` inter-service, cette liste
// ramènerait un SlotTemplate d'un autre tenant. Cette sûreté-là dépend donc,
// comme `template`/`location`/`thematic`, de la validation des références à
// l'écriture prévue par la tâche 14.
const withSlotTemplates = {
  slotTemplates: {
    include: { ...soignantLinksInclude, location: true, thematic: true },
  },
} as const

type Row = PathwayTemplate & {
  slotTemplates: Parameters<typeof flattenSlotTemplate>[0][]
}
const flatten = <T extends Row>({ slotTemplates, ...rest }: T) => ({
  ...rest,
  slotTemplates: slotTemplates.map(flattenSlotTemplate),
})

class PathwayTemplateRepository implements PathwayTemplateRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  async findAll(): Promise<PathwayTemplateWithSlotTemplatesRepo[]> {
    const rows = await this.prisma.pathwayTemplate.findMany({
      where: this.scope,
      include: withSlotTemplates,
      orderBy: { displayOrder: 'asc' },
    })
    return rows.map(flatten)
  }

  async reorder(orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.pathwayTemplate.update({
          where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
          data: { displayOrder: index },
        }),
      ),
    )
  }

  async findByID(
    pathwayTemplateID: string,
  ): Promise<PathwayTemplateWithSlotTemplatesRepo> {
    try {
      const row = await this.prisma.pathwayTemplate.findUniqueOrThrow({
        where: {
          id_serviceId: {
            id: pathwayTemplateID,
            serviceId: this.scope.serviceId,
          },
        },
        include: withSlotTemplates,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }

  async create(
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityRepo,
  ): Promise<PathwayTemplateWithSlotTemplatesRepo> {
    const { slotTemplateIDs, ...pathwayTemplateData } =
      pathwayTemplateCreateParams

    try {
      const row = await this.prisma.pathwayTemplate.create({
        data: {
          ...pathwayTemplateData,
          ...this.scope,
          slotTemplates: {
            connect: slotTemplateIDs?.map((id) => ({
              id_serviceId: { id, serviceId: this.scope.serviceId },
            })),
          },
        },
        include: withSlotTemplates,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }

  async update(
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityRepo,
  ): Promise<PathwayTemplateWithSlotTemplatesRepo> {
    try {
      const { slotTemplateIDs, ...data } = pathwayTemplateUpdateParams

      const row = await this.prisma.pathwayTemplate.update({
        where: {
          id_serviceId: {
            id: pathwayTemplateID,
            serviceId: this.scope.serviceId,
          },
        },
        data: {
          ...data,
          ...(slotTemplateIDs && {
            slotTemplates: {
              connect: slotTemplateIDs.map((id) => ({
                id_serviceId: { id, serviceId: this.scope.serviceId },
              })),
            },
          }),
        },
        include: withSlotTemplates,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }

  async delete(
    pathwayTemplateID: string,
  ): Promise<PathwayTemplateWithSlotTemplatesRepo> {
    try {
      const row = await this.prisma.pathwayTemplate.delete({
        where: {
          id_serviceId: {
            id: pathwayTemplateID,
            serviceId: this.scope.serviceId,
          },
        },
        include: withSlotTemplates,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }
}

export { PathwayTemplateRepository }

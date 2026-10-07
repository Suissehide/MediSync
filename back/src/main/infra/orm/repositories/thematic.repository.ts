import type { Soignant, Thematic } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  ThematicCreateEntityRepo,
  ThematicRepositoryInterface,
  ThematicUpdateEntityRepo,
  ThematicWithSoignantsEntityRepo,
} from '../../../types/infra/orm/repositories/thematic.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// Les soignants d'une thematique passent par la table de liaison
// SoignantThematic : ce repository l'aplatit systematiquement pour que
// domaines, schemas de reponse et front n'aient jamais a savoir qu'elle
// existe.
const withSoignants = {
  include: { soignantLinks: { include: { soignant: true } } },
} as const

type ThematicRow = Thematic & { soignantLinks: { soignant: Soignant }[] }

const flatten = ({
  soignantLinks,
  ...thematic
}: ThematicRow): ThematicWithSoignantsEntityRepo => ({
  ...thematic,
  soignants: soignantLinks.map((link) => link.soignant),
})

class ThematicRepository implements ThematicRepositoryInterface {
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

  async findAll(archived = false): Promise<ThematicWithSoignantsEntityRepo[]> {
    const rows = await this.prisma.thematic.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
      ...withSoignants,
    })
    return rows.map(flatten)
  }

  // Ne filtre pas les archivees, volontairement : les domaines rendez-vous,
  // modele de creneau et parcours s'en servent pour valider la cible d'un
  // `thematicId`. Filtrer ici casserait le simple reenregistrement d'un
  // rendez-vous qui porte deja une thematique archivee.
  async findByID(thematicID: string): Promise<ThematicWithSoignantsEntityRepo> {
    try {
      const row = await this.prisma.thematic.findUniqueOrThrow({
        where: {
          id_serviceId: { id: thematicID, serviceId: this.scope.serviceId },
        },
        ...withSoignants,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }

  private links(soignantIDs: string[]) {
    return soignantIDs.map((soignantId) => ({
      soignantId,
      establishmentId: this.scope.establishmentId,
    }))
  }

  async create(
    thematicCreateParams: ThematicCreateEntityRepo,
  ): Promise<ThematicWithSoignantsEntityRepo> {
    try {
      const row = await this.prisma.thematic.create({
        data: {
          name: thematicCreateParams.name,
          duration: thematicCreateParams.duration,
          pdfNotice: thematicCreateParams.pdfNotice,
          ...this.scope,
          soignantLinks: {
            create: this.links(thematicCreateParams.soignantIDs),
          },
        },
        ...withSoignants,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }

  async update(
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityRepo,
  ): Promise<ThematicWithSoignantsEntityRepo> {
    try {
      const row = await this.prisma.thematic.update({
        where: {
          id_serviceId: { id: thematicID, serviceId: this.scope.serviceId },
        },
        data: {
          name: thematicUpdateParams.name,
          duration: thematicUpdateParams.duration,
          pdfNotice: thematicUpdateParams.pdfNotice,
          ...(thematicUpdateParams.archived !== undefined && {
            archivedAt: thematicUpdateParams.archived ? new Date() : null,
          }),
          ...(thematicUpdateParams.soignantIDs && {
            soignantLinks: {
              deleteMany: {},
              create: this.links(thematicUpdateParams.soignantIDs),
            },
          }),
        },
        ...withSoignants,
      })
      return flatten(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }
}

export { ThematicRepository }

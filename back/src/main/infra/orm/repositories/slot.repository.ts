import { flattenSlot, slotTemplateInclude } from '../includes/slot-template.include'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  SlotCreateEntityRepo,
  SlotDateRangeRepo,
  SlotDTORepo,
  SlotEntityRepo,
  SlotRepositoryInterface,
  SlotUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/slot.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// Include partagé : un créneau embarque son modèle de créneau (avec ses
// liens soignants aplatis par flattenSlot), son parcours et ses rendez-vous.
const slotInclude = {
  slotTemplate: { include: slotTemplateInclude },
  pathway: { include: { template: true } },
  appointments: {
    include: {
      thematic: true,
      appointmentPatients: { include: { patient: true } },
    },
  },
} as const

// `pathwayID` n'est plus accepté en entrée (voir SlotCreateEntityRepo) : le
// seul rattachement légitime d'un créneau à un parcours est le `connect`
// composite interne à PathwayRepository. On le retire aussi à l'exécution,
// avant le passage à Prisma : les paramètres viennent d'un corps de requête,
// et l'invariant ne doit pas reposer sur le seul typage ni sur l'effet de
// bord d'un schéma Zod qui, aujourd'hui, ne déclare pas la clé.
const withoutPathwayID = <T extends object>(params: T): T => {
  const { pathwayID: _pathwayID, ...rest } = params as T & {
    pathwayID?: string
  }
  return rest as T
}

class SlotRepository implements SlotRepositoryInterface {
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

  async findAll(dateRange?: SlotDateRangeRepo): Promise<SlotDTORepo[]> {
    const rows = await this.prisma.slot.findMany({
      // Un créneau est retenu dès qu'il chevauche la fenêtre : il doit finir
      // après le début demandé et commencer avant la fin demandée.
      where: {
        ...this.scope,
        ...(dateRange?.from ? { endDate: { gt: dateRange.from } } : {}),
        ...(dateRange?.to ? { startDate: { lt: dateRange.to } } : {}),
      },
      include: slotInclude,
    })
    return rows.map(flattenSlot)
  }

  async findByID(slotID: string): Promise<SlotDTORepo> {
    try {
      const row = await this.prisma.slot.findUniqueOrThrow({
        where: { id_serviceId: { id: slotID, serviceId: this.scope.serviceId } },
        include: slotInclude,
      })
      return flattenSlot(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        error: err,
      })
    }
  }

  async create(slotCreateParams: SlotCreateEntityRepo): Promise<SlotDTORepo> {
    try {
      const row = await this.prisma.slot.create({
        data: { ...withoutPathwayID(slotCreateParams), ...this.scope },
        include: slotInclude,
      })
      return flattenSlot(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        error: err,
      })
    }
  }

  async update(
    slotID: string,
    slotUpdateParams: SlotUpdateEntityRepo,
  ): Promise<SlotDTORepo> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { slotTemplate: slotTemplateData, ...slotData } = slotUpdateParams

        if (slotTemplateData?.id) {
          const { soignantIDs, id: slotTemplateID, ...templateRest } = slotTemplateData
          const data = {
            ...templateRest,
            ...(soignantIDs !== undefined && {
              soignantLinks: {
                deleteMany: {},
                create: soignantIDs.map((soignantId) => ({ soignantId, ...this.scope })),
              },
            }),
          }
          await tx.slotTemplate.update({
            where: { id_serviceId: { id: slotTemplateID, serviceId: this.scope.serviceId } },
            data,
          })
        }

        const row = await tx.slot.update({
          where: { id_serviceId: { id: slotID, serviceId: this.scope.serviceId } },
          data: withoutPathwayID(slotData),
          include: slotInclude,
        })
        return flattenSlot(row)
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        parentEntityName: 'SlotTemplate',
        error: err,
      })
    }
  }

  async delete(slotID: string): Promise<SlotEntityRepo> {
    try {
      return await this.prisma.slot.delete({
        where: { id_serviceId: { id: slotID, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        error: err,
      })
    }
  }
}

export { SlotRepository }

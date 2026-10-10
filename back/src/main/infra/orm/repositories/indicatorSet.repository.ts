import { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  IndicatorEntityRepo,
  IndicatorSetEntityRepo,
  IndicatorSetRepositoryInterface,
  IndicatorSetUpdateEntityRepo,
  IndicatorUpdateEntityRepo,
  IndicatorWriteEntityRepo,
} from '../../../types/infra/orm/repositories/indicatorSet.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// `undefined` laisse la colonne JSON intacte (non fournie) ; `null` doit passer par
// `Prisma.JsonNull` pour devenir un NULL SQL, jamais un JS `null` brut (ignoré par Prisma).
const jsonInput = (value: unknown) => (value === null ? Prisma.JsonNull : value)

class IndicatorSetRepository implements IndicatorSetRepositoryInterface {
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

  findAll(): Promise<IndicatorSetEntityRepo[]> {
    return this.prisma.indicatorSet.findMany({
      where: { ...this.scope },
      orderBy: { order: 'asc' },
      include: { indicators: { orderBy: { order: 'asc' } } },
    })
  }

  async findByID(setId: string): Promise<IndicatorSetEntityRepo> {
    try {
      return await this.prisma.indicatorSet.findUniqueOrThrow({
        where: { id_serviceId: { id: setId, serviceId: this.scope.serviceId } },
        include: { indicators: { orderBy: { order: 'asc' } } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'IndicatorSet',
        error: err,
      })
    }
  }

  async create(params: {
    name: string
    order: number
  }): Promise<IndicatorSetEntityRepo> {
    try {
      const set = await this.prisma.indicatorSet.create({
        data: { name: params.name, order: params.order, ...this.scope },
      })
      return { ...set, indicators: [] }
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'IndicatorSet',
        error: err,
      })
    }
  }

  async update(
    setId: string,
    params: IndicatorSetUpdateEntityRepo,
  ): Promise<IndicatorSetEntityRepo> {
    try {
      await this.prisma.indicatorSet.update({
        where: { id_serviceId: { id: setId, serviceId: this.scope.serviceId } },
        data: { name: params.name, archivedAt: params.archivedAt },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'IndicatorSet',
        error: err,
      })
    }
    return this.findByID(setId)
  }

  async reorder(ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.indicatorSet.update({
          where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
          data: { order: index },
        }),
      ),
    )
  }

  async createIndicator(
    setId: string,
    params: IndicatorWriteEntityRepo & { order: number },
  ): Promise<IndicatorEntityRepo> {
    try {
      return await this.prisma.indicator.create({
        data: {
          ...this.scope,
          setId,
          code: params.code,
          label: params.label,
          group: params.group,
          order: params.order,
          nature: params.nature,
          measure: params.measure,
          options: jsonInput(params.options),
          filters: jsonInput(params.filters),
          breakdownField: params.breakdownField,
          input: params.input,
          note: params.note,
          parentId: params.parentId,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Indicator',
        error: err,
      })
    }
  }

  async updateIndicator(
    _setId: string,
    indicatorId: string,
    params: IndicatorUpdateEntityRepo,
  ): Promise<IndicatorEntityRepo> {
    try {
      return await this.prisma.indicator.update({
        where: {
          id_serviceId: { id: indicatorId, serviceId: this.scope.serviceId },
        },
        data: {
          code: params.code,
          label: params.label,
          group: params.group,
          nature: params.nature,
          measure: params.measure,
          options:
            params.options === undefined
              ? undefined
              : jsonInput(params.options),
          filters:
            params.filters === undefined
              ? undefined
              : jsonInput(params.filters),
          breakdownField: params.breakdownField,
          input: params.input,
          note: params.note,
          parentId: params.parentId,
          archivedAt: params.archivedAt,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Indicator',
        error: err,
      })
    }
  }

  async reorderIndicators(setId: string, ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.indicator.updateMany({
          where: { id, setId, ...this.scope },
          data: { order: index },
        }),
      ),
    )
  }
}

export { IndicatorSetRepository }

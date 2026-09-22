import type { IocContainer } from '../../../types/application/ioc'
import type {
  ActivityLogCreateEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
} from '../../../types/infra/orm/repositories/activityLog.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

const PAGE_SIZE = 50

class ActivityLogRepository implements ActivityLogRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  // Contexte lu au moment de l'écriture : null hors requête (runAsSystem).
  private get contextColumns(): { establishmentId: string | null; serviceId: string | null } {
    const store = this.tenantContext.peek()
    if (!store || store.kind !== 'tenant') {
      return { establishmentId: null, serviceId: null }
    }
    return { establishmentId: store.tenant.establishmentId, serviceId: store.tenant.serviceId }
  }

  async create(params: ActivityLogCreateEntityRepo): Promise<void> {
    await this.prisma.activityLog.create({ data: { ...params, ...this.contextColumns } })
  }

  async findMany({
    page,
    action,
    userID,
    from,
  }: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    const where = {
      ...this.tenantContext.establishmentScope(),
      serviceId: this.tenantContext.current().serviceId ?? undefined,
      ...(action ? { action } : {}),
      ...(userID ? { userID } : {}),
      ...(from ? { createdAt: { gte: from } } : {}),
    }
    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.activityLog.count({ where }),
    ])
    return { data, total, page }
  }

  // Sous runAsSystem (purge planifiée) : toute la table. Sous un tenant : le contexte courant.
  async deleteOlderThan(date: Date): Promise<number> {
    const store = this.tenantContext.peek()
    const where = store?.kind === 'tenant'
      ? { establishmentId: store.tenant.establishmentId, serviceId: store.tenant.serviceId ?? undefined, createdAt: { lt: date } }
      : { createdAt: { lt: date } }
    const result = await this.prisma.activityLog.deleteMany({ where })
    return result.count
  }
}

export { ActivityLogRepository }

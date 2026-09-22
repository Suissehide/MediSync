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
  private get contextColumns(): {
    establishmentId: string | null
    serviceId: string | null
  } {
    const store = this.tenantContext.peek()
    if (!store || store.kind !== 'tenant') {
      return { establishmentId: null, serviceId: null }
    }
    return {
      establishmentId: store.tenant.establishmentId,
      serviceId: store.tenant.serviceId,
    }
  }

  async create(params: ActivityLogCreateEntityRepo): Promise<void> {
    await this.prisma.activityLog.create({
      data: { ...params, ...this.contextColumns },
    })
  }

  // Le service courant, plus les entrees ecrites hors service. Les operations
  // de gestion des membres se font dans le contexte d'administration, qui n'a
  // pas de service : leurs lignes portent `serviceId = null` et seraient
  // invisibles — et jamais purgees — si le filtre se limitait au service
  // courant. On ne va pas jusqu'a ouvrir tout l'etablissement : l'activite des
  // autres services n'a pas a apparaitre dans un ecran monte sous un prefixe
  // de service.
  private get serviceFilter() {
    const { serviceId } = this.tenantContext.current()
    return serviceId === null
      ? { serviceId: null }
      : { OR: [{ serviceId }, { serviceId: null }] }
  }

  async findMany({
    page,
    action,
    userID,
    from,
  }: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    const where = {
      ...this.tenantContext.establishmentScope(),
      ...this.serviceFilter,
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

  // Sous runAsSystem (purge planifiee) : toute la table. Sous un tenant : le
  // meme perimetre que la lecture, pour que tout ce qui s'affiche soit
  // purgeable et que rien d'autre ne le soit.
  async deleteOlderThan(date: Date): Promise<number> {
    const store = this.tenantContext.peek()
    const where =
      store?.kind === 'tenant'
        ? {
            establishmentId: store.tenant.establishmentId,
            ...this.serviceFilter,
            createdAt: { lt: date },
          }
        : { createdAt: { lt: date } }
    const result = await this.prisma.activityLog.deleteMany({ where })
    return result.count
  }
}

export { ActivityLogRepository }

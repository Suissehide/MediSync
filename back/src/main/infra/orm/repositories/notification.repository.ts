import type { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  NotificationCreateEntityRepo,
  NotificationEntityRepo,
  NotificationRepositoryInterface,
} from '../../../types/infra/orm/repositories/notification.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class NotificationRepository implements NotificationRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  findMine(userId: string, since: Date): Promise<NotificationEntityRepo[]> {
    return this.prisma.notification.findMany({
      where: {
        ...this.tenantContext.scope(),
        userId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async markRead(userId: string, notificationId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        ...this.tenantContext.scope(),
        id: notificationId,
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    })
    if (count > 0) {
      return count
    }
    return this.prisma.notification.count({
      where: { ...this.tenantContext.scope(), id: notificationId, userId },
    })
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...this.tenantContext.scope(), userId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  async createMany(rows: NotificationCreateEntityRepo[]): Promise<void> {
    if (rows.length === 0) {
      return
    }
    const scope = this.tenantContext.scope()
    await this.prisma.notification.createMany({
      data: rows.map((r) => ({
        ...scope,
        ...r,
        payload: r.payload as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    })
  }
}

export { NotificationRepository }

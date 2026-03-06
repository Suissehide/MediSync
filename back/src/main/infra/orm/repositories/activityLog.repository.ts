import type { IocContainer } from '../../../types/application/ioc'
import type {
  ActivityLogCreateEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
} from '../../../types/infra/orm/repositories/activityLog.repository.interface'
import type { PostgresPrismaClient } from '../postgres-client'

const PAGE_SIZE = 50

class ActivityLogRepository implements ActivityLogRepositoryInterface {
  private readonly prisma: PostgresPrismaClient

  constructor({ postgresOrm }: IocContainer) {
    this.prisma = postgresOrm.prisma
  }

  async create(params: ActivityLogCreateEntityRepo): Promise<void> {
    await this.prisma.activityLog.create({ data: params })
  }

  async findMany({
    page,
    action,
    userID,
    from,
  }: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    const where = {
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

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.activityLog.deleteMany({
      where: { createdAt: { lt: date } },
    })
    return result.count
  }
}

export { ActivityLogRepository }

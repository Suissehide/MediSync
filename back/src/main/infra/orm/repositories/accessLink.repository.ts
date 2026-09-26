import type { IocContainer } from '../../../types/application/ioc'
import type {
  AccessLinkCreateEntityRepo,
  AccessLinkRepositoryInterface,
  AccessLinkWithUser,
} from '../../../types/infra/orm/repositories/accessLink.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class AccessLinkRepository implements AccessLinkRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  async invalidateActiveForUser(userId: string, now: Date): Promise<void> {
    await this.prisma.accessLink.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    })
  }

  async create(params: AccessLinkCreateEntityRepo): Promise<void> {
    try {
      await this.prisma.accessLink.create({ data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'AccessLink',
        error: err,
      })
    }
  }

  findByTokenHashWithUser(tokenHash: string): Promise<AccessLinkWithUser | null> {
    return this.prisma.accessLink.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, deactivatedAt: true } } },
    })
  }

  // Le compte de lignes touchées, pas une lecture préalable, est ce qui rend cette méthode sûre
  // sous deux appels simultanés (Review Focus n°1) : `usedAt: null` ET `expiresAt: { gt: now }`
  // dans le MÊME `where` que l'écriture, jamais vérifiés séparément avant.
  async consumeIfActive(tokenHash: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.accessLink.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    return count === 1
  }
}

export { AccessLinkRepository }

import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type { NotificationDomainInterface } from '../types/domain/notification.domain.interface'
import type {
  NotificationEntityRepo,
  NotificationRepositoryInterface,
} from '../types/infra/orm/repositories/notification.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'

const RETENTION_MS = 30 * 86_400_000

class NotificationDomain implements NotificationDomainInterface {
  private readonly notificationRepository: NotificationRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ notificationRepository, tenantContext }: IocContainer) {
    this.notificationRepository = notificationRepository
    this.tenantContext = tenantContext
  }

  private get userId() {
    return this.tenantContext.current().userId
  }

  findMine(): Promise<NotificationEntityRepo[]> {
    return this.notificationRepository.findMine(
      this.userId,
      new Date(Date.now() - RETENTION_MS),
    )
  }

  async markRead(notificationId: string): Promise<void> {
    if (
      (await this.notificationRepository.markRead(
        this.userId,
        notificationId,
      )) === 0
    ) {
      throw Boom.notFound('Notification not found')
    }
  }

  markAllRead(): Promise<void> {
    return this.notificationRepository.markAllRead(this.userId)
  }
}

export { NotificationDomain }

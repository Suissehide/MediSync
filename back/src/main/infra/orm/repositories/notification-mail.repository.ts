import type { NotificationMailState } from '../../../../generated/enums'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  NotificationMailRepositoryInterface,
  PendingNotificationRow,
  RecipientRow,
} from '../../../types/infra/orm/repositories/notification-mail.repository.interface'
import type { UserRepositoryInterface } from '../../../types/infra/orm/repositories/user.repository.interface'
import type { PostgresPrismaClient } from '../postgres-client'

// Hors tenant, file d'envoi globale : aucune methode ne lit tenantContext.scope().
class NotificationMailRepository
  implements NotificationMailRepositoryInterface
{
  private readonly prisma: PostgresPrismaClient
  private readonly userRepository: UserRepositoryInterface

  constructor({ postgresOrm, userRepository }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.userRepository = userRepository
  }

  async pending(since: Date): Promise<PendingNotificationRow[]> {
    const rows = await this.prisma.notification.findMany({
      where: { mailState: 'PENDING', createdAt: { gte: since } },
      select: {
        id: true,
        userId: true,
        type: true,
        payload: true,
        serviceId: true,
        readAt: true,
        createdAt: true,
      },
    })
    return rows.map((r) => ({
      ...r,
      payload: r.payload as Record<string, unknown>,
    }))
  }

  async expireOlderThan(date: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { mailState: 'PENDING', createdAt: { lt: date } },
      data: { mailState: 'SKIPPED' },
    })
    return count
  }

  // Preferences : meme normalisation + services reels que UserRepository.findNotificationPrefsMany, reutilisee.
  async recipients(userIds: string[]): Promise<Map<string, RecipientRow>> {
    if (userIds.length === 0) {
      return new Map()
    }
    const [users, prefs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          deactivatedAt: true,
        },
      }),
      this.userRepository.findNotificationPrefsMany(userIds),
    ])
    const entries: [string, RecipientRow][] = []
    for (const u of users) {
      const prefsOfUser = prefs.get(u.id)
      // Prefs introuvables pour cet utilisateur : il est ignore, jamais toute la file en echec.
      if (!prefsOfUser) {
        continue
      }
      entries.push([
        u.id,
        {
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          deactivatedAt: u.deactivatedAt,
          prefs: prefsOfUser,
        },
      ])
    }
    return new Map(entries)
  }

  async names(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map()
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    return new Map(
      users.map((u) => [
        u.id,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
      ]),
    )
  }

  async mark(ids: string[], state: NotificationMailState): Promise<void> {
    if (ids.length === 0) {
      return
    }
    await this.prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { mailState: state },
    })
  }

  // Un updateMany par id, borne a PENDING -> SENT : au plus un appel concurrent gagne la ligne.
  async claim(ids: string[]): Promise<string[]> {
    const claimed = await Promise.all(
      ids.map(async (id) => {
        const { count } = await this.prisma.notification.updateMany({
          where: { id, mailState: 'PENDING' },
          data: { mailState: 'SENT' },
        })
        return count === 1 ? id : null
      }),
    )
    return claimed.filter((id): id is string => id !== null)
  }
}

export { NotificationMailRepository }

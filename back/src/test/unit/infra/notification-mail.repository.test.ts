import { NotificationMailRepository } from '../../../main/infra/orm/repositories/notification-mail.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import { DEFAULT_PREFS } from '../../../main/utils/notification-prefs'

const USER = (id: string) => ({
  id,
  email: `${id}@t.fr`,
  firstName: 'A',
  lastName: 'B',
  deactivatedAt: null,
})

describe('NotificationMailRepository.recipients', () => {
  it('prefs introuvables pour un utilisateur : il est ignore, les autres restent', async () => {
    const findMany = jest.fn().mockResolvedValue([USER('u1'), USER('u2')])
    const findNotificationPrefsMany = jest
      .fn()
      .mockResolvedValue(new Map([['u1', DEFAULT_PREFS]]))
    const repo = new NotificationMailRepository({
      postgresOrm: { prisma: { user: { findMany } } },
      userRepository: { findNotificationPrefsMany },
    } as unknown as IocContainer)

    const result = await repo.recipients(['u1', 'u2'])

    expect(result.size).toBe(1)
    expect(result.has('u1')).toBe(true)
    expect(result.has('u2')).toBe(false)
  })
})

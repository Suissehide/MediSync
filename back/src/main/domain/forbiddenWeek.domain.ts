import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import type { IocContainer } from '../types/application/ioc'
import type {
  ForbiddenWeekDomainInterface,
  ForbiddenWeekEntityDomain,
} from '../types/domain/forbiddenWeek.domain.interface'
import type { ForbiddenWeekRepositoryInterface } from '../types/infra/orm/repositories/forbiddenWeek.repository.interface'

dayjs.extend(utc)

/** Returns the Monday (00:00 UTC) of the week containing the given date. */
function toStartOfWeek(date: Date): Date {
  const d = dayjs.utc(date)
  const day = d.day() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = day === 0 ? -6 : 1 - day
  return d.add(daysToMonday, 'day').startOf('day').toDate()
}

class ForbiddenWeekDomain implements ForbiddenWeekDomainInterface {
  private readonly forbiddenWeekRepository: ForbiddenWeekRepositoryInterface

  constructor({ forbiddenWeekRepository }: IocContainer) {
    this.forbiddenWeekRepository = forbiddenWeekRepository
  }

  findAll(): Promise<ForbiddenWeekEntityDomain[]> {
    return this.forbiddenWeekRepository.findAll()
  }

  create(date: Date): Promise<ForbiddenWeekEntityDomain> {
    const startOfWeek = toStartOfWeek(date)
    return this.forbiddenWeekRepository.create({ startOfWeek })
  }

  delete(id: string): Promise<ForbiddenWeekEntityDomain> {
    return this.forbiddenWeekRepository.delete(id)
  }
}

export { ForbiddenWeekDomain, toStartOfWeek }

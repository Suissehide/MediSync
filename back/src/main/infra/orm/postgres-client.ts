import { Prisma, PrismaClient } from '@prisma/client'

import type { IocContainer } from '../../types/application/ioc'
import { normalizeEmail, normalizePhone } from '../../utils/helper'
import type {
  PostgresORMInterface,
  PrimaTransactionClient,
} from '../../types/infra/orm/client'
import type { Logger } from '../../types/utils/logger'

const normalizerExtension = Prisma.defineExtension({
  name: 'normalizer',
  query: {
    $allOperations({ args, query }) {
      if (typeof args.data?.email === 'string') {
        args.data.email = normalizeEmail(args.data.email)
      }
      if (typeof args.data?.phoneNumber === 'string') {
        args.data.phoneNumber = normalizePhone(args.data.phoneNumber)
      }
      if (typeof args.where?.email === 'string') {
        args.where.email = normalizeEmail(args.where.email)
      }
      if (typeof args.where?.phoneNumber === 'string') {
        args.where.phoneNumber = normalizePhone(args.where.phoneNumber)
      }
      return query(args)
    },
  },
})

function getExtendedClient() {
  return new PrismaClient().$extends(normalizerExtension)
}

export type PostgresPrismaClient = ReturnType<typeof getExtendedClient>

class PostgresOrm implements PostgresORMInterface {
  private readonly logger: Logger
  readonly prisma: PostgresPrismaClient

  constructor({ logger }: IocContainer) {
    this.logger = logger
    const prisma = new PrismaClient({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    })
    this.prisma = getExtendedClient()
    prisma.$on('query', (e) => {
      logger.trace(`prisma query: ${e.query} [${e.params}] (${e.duration}ms)`)
    })
    prisma.$on('error', (e) => {
      logger.error(e.message)
    })
    prisma.$on('warn', (e) => {
      logger.warn(e.message)
    })
    prisma.$on('info', (e) => {
      logger.info(e.message)
    })
  }

  async start(): Promise<void> {
    this.logger.debug('Starting ORM client…')
    await this.prisma.$connect()
    this.logger.debug('ORM client started.')
  }

  async stop(): Promise<void> {
    this.logger.debug('Stopping ORM client…')
    await this.prisma.$disconnect()
    this.logger.debug('ORM client stopped.')
  }

  async healthCheck(): Promise<boolean> {
    this.logger.trace('Postgres health check triggered')
    try {
      await this.prisma.$queryRaw`SELECT 1;`
      return true
    } catch {
      return false
    }
  }

  executeWithTransactionClient<T>(
    functionWithTransactionClient: (
      transaction: PrimaTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel
      maxWait?: number
      timeout?: number
    },
  ): Promise<T> {
    return this.prisma.$transaction(functionWithTransactionClient, options)
  }
}

export { PostgresOrm }

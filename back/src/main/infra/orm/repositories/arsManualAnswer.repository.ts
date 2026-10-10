import type { IocContainer } from '../../../types/application/ioc'
import type { ArsManualAnswerRepositoryInterface } from '../../../types/infra/orm/repositories/arsManualAnswer.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { ArsAnswer } from '../../../utils/ars-indicators'
import type { PostgresPrismaClient } from '../postgres-client'

const answerSelect = {
  numberValue: true,
  textValue: true,
  boolValue: true,
} as const

class ArsManualAnswerRepository implements ArsManualAnswerRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  async findByYear(year: number): Promise<Map<string, ArsAnswer>> {
    const rows = await this.prisma.arsManualAnswer.findMany({
      where: { ...this.scope, year },
      select: { code: true, ...answerSelect },
    })
    return new Map(rows.map(({ code, ...answer }) => [code, answer]))
  }

  upsert(
    year: number,
    code: string,
    values: ArsAnswer,
    userId: string,
  ): Promise<ArsAnswer> {
    const data = { ...values, updatedById: userId }
    return this.prisma.arsManualAnswer.upsert({
      where: {
        serviceId_year_code: { serviceId: this.scope.serviceId, year, code },
      },
      create: { ...data, year, code, ...this.scope },
      update: data,
      select: answerSelect,
    })
  }
}

export { ArsManualAnswerRepository }

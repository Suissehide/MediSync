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

const ARS_SET = { name: 'Grille ARS' }

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

  // Transitoire : lit et écrit IndicatorAnswer sur l'indicateur de même code de la « Grille ARS ».
  async findByYear(year: number): Promise<Map<string, ArsAnswer>> {
    const rows = await this.prisma.indicatorAnswer.findMany({
      where: { ...this.scope, year, indicator: { set: ARS_SET } },
      select: { ...answerSelect, indicator: { select: { code: true } } },
    })
    return new Map(
      rows.map(({ indicator, ...answer }) => [indicator.code, answer]),
    )
  }

  async upsert(
    year: number,
    code: string,
    values: ArsAnswer,
    userId: string,
  ): Promise<ArsAnswer> {
    const { id: indicatorId } = await this.prisma.indicator.findFirstOrThrow({
      where: { ...this.scope, code, set: ARS_SET },
      select: { id: true },
    })
    const data = { ...values, updatedById: userId }
    return this.prisma.indicatorAnswer.upsert({
      where: { indicatorId_year: { indicatorId, year }, ...this.scope },
      create: { ...data, year, indicatorId, ...this.scope },
      update: data,
      select: answerSelect,
    })
  }
}

export { ArsManualAnswerRepository }

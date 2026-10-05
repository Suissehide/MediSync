import * as XLSX from 'xlsx'

import type { IocContainer } from '../types/application/ioc'
import type {
  ArsIndicatorDomainInterface,
  ArsRange,
} from '../types/domain/arsIndicator.domain.interface'
import type { ArsIndicatorRepositoryInterface } from '../types/infra/orm/repositories/arsIndicator.repository.interface'
import {
  type ArsIndicatorResult,
  computeArsIndicators,
} from '../utils/ars-indicators'

class ArsIndicatorDomain implements ArsIndicatorDomainInterface {
  private readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface

  constructor({ arsIndicatorRepository }: IocContainer) {
    this.arsIndicatorRepository = arsIndicatorRepository
  }

  async findAll({ from, to }: ArsRange): Promise<ArsIndicatorResult[]> {
    const files = await this.arsIndicatorRepository.findCohort()
    return computeArsIndicators({ from, to, files })
  }

  async exportExcel(range: ArsRange): Promise<Buffer> {
    const [indicators, serviceName] = await Promise.all([
      this.findAll(range),
      this.arsIndicatorRepository.findServiceName(),
    ])

    const periode = `${range.from.toISOString().slice(0, 10)} au ${range.to
      .toISOString()
      .slice(0, 10)}`
    const rows = [
      { Code: 'Service', Libellé: serviceName, Valeur: '' },
      { Code: 'Période', Libellé: periode, Valeur: '' },
      { Code: '', Libellé: '', Valeur: '' },
      ...indicators.map((i) => ({
        Code: i.code,
        Libellé: i.label,
        Valeur: i.value ?? (i.note ?? ''),
      })),
    ]

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 90 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Indicateurs ARS')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
}

export { ArsIndicatorDomain }

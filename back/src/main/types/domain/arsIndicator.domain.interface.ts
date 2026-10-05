import type { ArsIndicatorResult } from '../../utils/ars-indicators'

export type ArsRange = { from: Date; to: Date }

export interface ArsIndicatorDomainInterface {
  findAll: (range: ArsRange) => Promise<ArsIndicatorResult[]>
  exportExcel: (range: ArsRange) => Promise<Buffer>
}

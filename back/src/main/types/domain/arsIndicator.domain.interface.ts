import type { ArsAnswer, ArsIndicatorResult } from '../../utils/ars-indicators'

export type ArsRange = { from: Date; to: Date }

export type ArsAnswerInput =
  | { numberValue: number | null; textValue: string | null }
  | { boolValue: boolean | null }

export type ArsIndicatorsView = {
  manualYear: number | null
  indicators: ArsIndicatorResult[]
}

export interface ArsIndicatorDomainInterface {
  findAll: (range: ArsRange) => Promise<ArsIndicatorsView>
  saveAnswer: (
    year: number,
    code: string,
    body: ArsAnswerInput,
    userId: string,
  ) => Promise<ArsAnswer>
  exportExcel: (range: ArsRange) => Promise<Buffer>
}

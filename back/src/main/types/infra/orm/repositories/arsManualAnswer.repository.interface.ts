import type { ArsAnswer } from '../../../../utils/ars-indicators'

export interface ArsManualAnswerRepositoryInterface {
  findByYear: (year: number) => Promise<Map<string, ArsAnswer>>
  upsert: (
    year: number,
    code: string,
    values: ArsAnswer,
    userId: string,
  ) => Promise<ArsAnswer>
}

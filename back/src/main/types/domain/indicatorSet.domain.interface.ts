import type { Indicator, IndicatorSet } from '../../../generated/client'
import type { DateRange } from '../../utils/indicators/cohort'
import type {
  BreakdownRow,
  ComputedResult,
  IndicatorDefinition,
} from '../../utils/indicators/compute'
import type { FilterCondition } from '../../utils/indicators/filters'
import type { IndicatorAnswerEntityRepo } from '../infra/orm/repositories/indicatorSet.repository.interface'

export type IndicatorEntityDomain = Indicator
export type IndicatorSetEntityDomain = IndicatorSet & {
  indicators: IndicatorEntityDomain[]
}

export type IndicatorWriteEntityDomain = {
  code: string
  label: string
  group: string
  nature: 'computed' | 'manual' | 'unavailable'
  measure: string | null
  options: Record<string, string | number | boolean> | null
  filters: FilterCondition[] | null
  breakdownField: string | null
  input: 'number+text' | 'yesno' | null
  note: string | null
  parentId: string | null
}

export type IndicatorUpdateEntityDomain =
  Partial<IndicatorWriteEntityDomain> & {
    archived?: boolean
  }

export type IndicatorSetUpdateEntityDomain = {
  name?: string
  archived?: boolean
}

export type IndicatorAnswerInput =
  | { numberValue: number | null; textValue: string | null }
  | { boolValue: boolean | null }

export type IndicatorResult = {
  id: string
  code: string
  group: string
  label: string
  nature: string
  value: number | null
  breakdown: BreakdownRow[] | null
  note: string | null
  input: string | null
  answer: IndicatorAnswerEntityRepo | null
  parentId: string | null
  warnings: string[]
}

export type IndicatorSetResults = {
  manualYear: number | null
  indicators: IndicatorResult[]
}

export interface IndicatorSetDomainInterface {
  findAll: () => Promise<IndicatorSetEntityDomain[]>
  findByID: (setId: string) => Promise<IndicatorSetEntityDomain>
  create: (params: { name: string }) => Promise<IndicatorSetEntityDomain>
  update: (
    setId: string,
    params: IndicatorSetUpdateEntityDomain,
  ) => Promise<IndicatorSetEntityDomain>
  reorder: (ids: string[]) => Promise<void>
  createIndicator: (
    setId: string,
    params: IndicatorWriteEntityDomain,
  ) => Promise<IndicatorEntityDomain>
  updateIndicator: (
    setId: string,
    indicatorId: string,
    params: IndicatorUpdateEntityDomain,
  ) => Promise<IndicatorEntityDomain>
  reorderIndicators: (setId: string, ids: string[]) => Promise<void>
  results: (setId: string, range: DateRange) => Promise<IndicatorSetResults>
  saveAnswer: (
    setId: string,
    year: number,
    indicatorId: string,
    body: IndicatorAnswerInput,
    userId: string,
  ) => Promise<IndicatorAnswerEntityRepo>
  preview: (
    setId: string,
    indicator: IndicatorDefinition,
    range: DateRange,
  ) => Promise<ComputedResult>
  exportExcel: (setId: string, range: DateRange) => Promise<Buffer>
}

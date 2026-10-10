import type { Indicator, IndicatorSet } from '../../../generated/client'
import type { FilterCondition } from '../../utils/indicators/filters'

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
}

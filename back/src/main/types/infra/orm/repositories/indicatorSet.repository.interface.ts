import type { Indicator, IndicatorSet } from '../../../../../generated/client'
import type { FilterCondition } from '../../../../utils/indicators/filters'

export type IndicatorEntityRepo = Indicator
export type IndicatorSetEntityRepo = IndicatorSet & {
  indicators: IndicatorEntityRepo[]
}

export type IndicatorWriteEntityRepo = {
  code: string
  label: string
  group: string
  nature: string
  measure: string | null
  options: Record<string, string | number | boolean> | null
  filters: FilterCondition[] | null
  breakdownField: string | null
  input: string | null
  note: string | null
  parentId: string | null
}

export type IndicatorUpdateEntityRepo = Partial<IndicatorWriteEntityRepo> & {
  archivedAt?: Date | null
}

export type IndicatorSetUpdateEntityRepo = {
  name?: string
  archivedAt?: Date | null
}

export type IndicatorAnswerEntityRepo = {
  numberValue: number | null
  textValue: string | null
  boolValue: boolean | null
}

export interface IndicatorSetRepositoryInterface {
  findAll: () => Promise<IndicatorSetEntityRepo[]>
  findByID: (setId: string) => Promise<IndicatorSetEntityRepo>
  create: (params: {
    name: string
    order: number
  }) => Promise<IndicatorSetEntityRepo>
  update: (
    setId: string,
    params: IndicatorSetUpdateEntityRepo,
  ) => Promise<IndicatorSetEntityRepo>
  reorder: (ids: string[]) => Promise<void>
  createIndicator: (
    setId: string,
    params: IndicatorWriteEntityRepo & { order: number },
  ) => Promise<IndicatorEntityRepo>
  updateIndicator: (
    setId: string,
    indicatorId: string,
    params: IndicatorUpdateEntityRepo,
  ) => Promise<IndicatorEntityRepo>
  reorderIndicators: (setId: string, ids: string[]) => Promise<void>
  // Réponses d'une année, par identifiant d'indicateur du jeu.
  findAnswers: (
    setId: string,
    year: number,
  ) => Promise<Map<string, IndicatorAnswerEntityRepo>>
  upsertAnswer: (
    indicatorId: string,
    year: number,
    values: IndicatorAnswerEntityRepo,
    userId: string,
  ) => Promise<IndicatorAnswerEntityRepo>
}

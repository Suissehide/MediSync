export type IndicatorNature = 'computed' | 'unavailable' | 'manual'
export type IndicatorInput = 'number+text' | 'yesno'

export type FilterCondition =
  | { field: string; op: 'in' | 'containsAny'; value: string[] }
  | { field: string; op: 'eq'; value: boolean | number }
  | { field: string; op: 'lt' | 'lte' | 'gt' | 'gte'; value: number }
  | { field: string; op: 'before' | 'after'; value: string }

export type FilterOp = FilterCondition['op']

export type IndicatorOptions = Record<string, string | number | boolean>

export type IndicatorDefinition = {
  nature: IndicatorNature
  measure: string | null
  options: IndicatorOptions | null
  filters: FilterCondition[] | null
  breakdownField: string | null
  input: IndicatorInput | null
  note: string | null
}

export type IndicatorBody = IndicatorDefinition & {
  code: string
  label: string
  group: string
  parentId: string | null
}

export type Indicator = IndicatorBody & {
  id: string
  order: number
  archived: boolean
}

export type IndicatorSet = {
  id: string
  name: string
  order: number
  archived: boolean
  indicators: Indicator[]
}

export type MeasureOption = {
  name: string
  label: string
  kind: 'boolean' | 'enum'
  choices?: { value: string; label: string }[]
}

export type MeasureCatalogEntry = {
  key: string
  label: string
  description: string
  unit: string
  options: MeasureOption[]
}

export type IndicatorPreview = {
  value: number | null
  breakdown: BreakdownRow[] | null
  warnings: string[]
}

export type ActivitySettings = {
  stopReasonFieldKey: string | null
  completedChoiceKey: string | null
}

export type IndicatorAnswer = {
  numberValue: number | null
  textValue: string | null
  boolValue: boolean | null
}

export type BreakdownRow = { key: string; label: string; value: number }

export type IndicatorResult = {
  id: string
  code: string
  group: string
  label: string
  nature: IndicatorNature
  value: number | null
  breakdown: BreakdownRow[] | null
  note: string | null
  input: IndicatorInput | null
  answer: IndicatorAnswer | null
  parentId: string | null
  warnings: string[]
}

export type IndicatorResults = {
  from: string
  to: string
  manualYear: number | null
  indicators: IndicatorResult[]
}

// Corps du PUT de saisie : nombre + texte, ou oui/non.
export type IndicatorAnswerBody =
  | { numberValue: number | null; textValue: string | null }
  | { boolValue: boolean | null }

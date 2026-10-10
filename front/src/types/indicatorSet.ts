export type IndicatorNature = 'computed' | 'unavailable' | 'manual'
export type IndicatorInput = 'number+text' | 'yesno'

// Seuls les champs que lit la consultation ; la configuration (tâche suivante) en lira davantage.
export type IndicatorSet = {
  id: string
  name: string
  order: number
  archived: boolean
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

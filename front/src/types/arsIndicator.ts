export type ArsKind = 'computed' | 'unavailable' | 'manual'
export type ArsInput = 'number+text' | 'yesno'

export type ArsAnswer = {
  numberValue: number | null
  textValue: string | null
  boolValue: boolean | null
}

export type ArsIndicator = {
  code: string
  group: string
  label: string
  value: number | null
  note: string | null
  kind: ArsKind
  input: ArsInput | null
  answer: ArsAnswer | null
}

export type ArsIndicators = {
  from: string
  to: string
  manualYear: number | null
  indicators: ArsIndicator[]
}

// Corps du PUT de saisie : 2.5 (nombre + texte, les deux requis) ou 4.2 (oui/non).
export type ArsAnswerBody =
  | { numberValue: number | null; textValue: string | null }
  | { boolValue: boolean | null }

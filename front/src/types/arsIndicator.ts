export type ArsIndicator = {
  code: string
  group: string
  label: string
  value: number | null
  note: string | null
}

export type ArsIndicators = {
  from: string
  to: string
  indicators: ArsIndicator[]
}

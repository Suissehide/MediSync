export const SLOT_DURATIONS = [15, 30, 45, 60, 75, 90, 120] as const

export const SLOT_DURATION_OPTIONS = SLOT_DURATIONS.map((d) => ({
  value: d,
  label: `${d} minutes`,
}))

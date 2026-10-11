export type AbsenceCell = {
  absent: number
  pointed: number
  rate: number | null
}

export type MonthlyCell = {
  month: string
  newlyIncluded: number
  exited: number
  active: number
}

export type ActivityReport = {
  from: string
  to: string
  patients: { active: number; newlyIncluded: number; exited: number }
  monthly: MonthlyCell[]
  completion: {
    completed: number
    exited: number
    rate: number | null
    dropouts: number
    dropoutReasons: { reason: string; label: string; count: number }[]
  } | null
  absences: {
    overall: AbsenceCell
    worst: { thematic: string; weekday: number } | null
    weekdays: number[]
    byWeekday: AbsenceCell[]
    byThematic: { thematic: string; total: AbsenceCell; cells: AbsenceCell[] }[]
    byPathway: { pathway: string; cell: AbsenceCell }[]
  }
  sessions: {
    individual: number
    collective: number
    educationalDiagnoses: number
    finalReviews: number
  }
  hoursBySoignant: { soignant: string; hours: number }[]
}

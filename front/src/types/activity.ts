export type AbsenceCell = {
  absent: number
  pointed: number
  rate: number | null
}

export type ActivityReport = {
  from: string
  to: string
  patients: { active: number; newlyIncluded: number; exited: number }
  completion: {
    completed: number
    exited: number
    rate: number | null
    dropouts: number
    dropoutReasons: { reason: string; count: number }[]
  }
  absences: {
    overall: AbsenceCell
    worst: { thematic: string; weekday: number } | null
    weekdays: number[]
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

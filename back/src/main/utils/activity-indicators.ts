import {
  type ArsCohort,
  type ArsPresence,
  completeProgram,
  deDate,
  finDeJournee,
  inRange,
  isRole,
} from './ars-indicators'

export const SEUIL_ABSENCES = 5
export const FIN_DE_PARCOURS = 'PLUS_BESOIN_FIN_PARCOURS'

export type AbsenceCell = {
  absent: number
  pointed: number
  rate: number | null
}

export type ActivityReport = {
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

const cell = (ps: ArsPresence[], seuil = SEUIL_ABSENCES): AbsenceCell => {
  const absent = ps.filter((p) => p.status === 'no').length
  const pointed = ps.length
  return {
    absent,
    pointed,
    rate: pointed >= seuil && pointed > 0 ? absent / pointed : null,
  }
}

const groupBy = <K>(
  ps: ArsPresence[],
  key: (p: ArsPresence) => K,
): Map<K, ArsPresence[]> => {
  const groups = new Map<K, ArsPresence[]>()
  for (const p of ps) {
    const k = key(p)
    const group = groups.get(k)
    if (group) {
      group.push(p)
    } else {
      groups.set(k, [p])
    }
  }
  return groups
}

// 0 = lundi … 6 = dimanche, en UTC comme les bornes de période.
const weekday = (date: Date): number => (date.getUTCDay() + 6) % 7

const byCountDesc = <T extends { count: number }>(a: T, b: T) =>
  b.count - a.count

const groupByReason = (reasons: string[]) =>
  [
    ...reasons.reduce(
      (m, r) => m.set(r, (m.get(r) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ].map(([reason, count]) => ({ reason, count }))

const absences = (pointed: ArsPresence[]): ActivityReport['absences'] => {
  const byThematic = [
    ...groupBy(pointed, (p) => p.thematicName ?? 'Sans thématique'),
  ]
    .map(([thematic, ps]) => {
      const days = groupBy(ps, (p) => weekday(p.date))
      return {
        thematic,
        total: cell(ps),
        cells: Array.from({ length: 7 }, (_, d) => cell(days.get(d) ?? [])),
      }
    })
    .sort((a, b) => b.total.pointed - a.total.pointed)

  let worst: ActivityReport['absences']['worst'] = null
  let worstRate = 0
  for (const t of byThematic) {
    for (const [d, day] of t.cells.entries()) {
      if (day.rate !== null && day.rate > worstRate) {
        worstRate = day.rate
        worst = { thematic: t.thematic, weekday: d }
      }
    }
  }

  return {
    overall: cell(pointed, 1),
    worst,
    weekdays: [...new Set(pointed.map((p) => weekday(p.date)))].sort(),
    byThematic,
    byPathway: [...groupBy(pointed, (p) => p.pathwayId ?? 'hors-parcours')]
      .map(([, ps]) => ({
        pathway: ps[0]?.pathwayLabel ?? 'Hors parcours',
        cell: cell(ps),
      }))
      .sort((a, b) => b.cell.pointed - a.cell.pointed),
  }
}

const hoursBySoignant = (
  honored: ArsPresence[],
): ActivityReport['hoursBySoignant'] => {
  const realizedSlots = groupBy(honored, (p) => p.slotId)
  const minutes = new Map<string, number>()
  for (const ps of realizedSlots.values()) {
    const p = ps[0]
    if (p === undefined) {
      continue
    }
    for (const soignant of p.soignants) {
      minutes.set(soignant, (minutes.get(soignant) ?? 0) + p.slotMinutes)
    }
  }
  return [...minutes]
    .map(([soignant, m]) => ({ soignant, hours: m / 60 }))
    .sort((a, b) => b.hours - a.hours || a.soignant.localeCompare(b.soignant))
}

export const computeActivity = (cohort: ArsCohort): ActivityReport => {
  const c: ArsCohort = { ...cohort, to: finDeJournee(cohort.to) }
  const inPeriod = c.presences.filter((p) => inRange(p.date, c.from, c.to))
  const honored = inPeriod.filter((p) => p.status === 'yes')
  const pointed = inPeriod.filter((p) => p.status !== null)

  const exited = c.files.filter((f) => inRange(f.exitDate, c.from, c.to))
  // Le programme s'évalue depuis l'origine : un patient inclus l'an dernier peut terminer cette année.
  const depuisToujours: ArsCohort = { ...c, from: new Date(0) }
  const completed = exited.filter((f) => completeProgram(f, depuisToujours))
  const dropped = exited.filter(
    (f) => Boolean(f.stopReason) && f.stopReason !== FIN_DE_PARCOURS,
  )

  return {
    patients: {
      active: new Set(honored.map((p) => p.patientId)).size,
      newlyIncluded: c.files.filter((f) => deDate(f, c) !== null).length,
      exited: exited.length,
    },
    completion: {
      completed: completed.length,
      exited: exited.length,
      rate: exited.length > 0 ? completed.length / exited.length : null,
      dropouts: dropped.length,
      dropoutReasons: [
        ...groupByReason(dropped.map((f) => f.stopReason as string)),
      ].sort(byCountDesc),
    },
    absences: absences(pointed),
    sessions: {
      individual: honored.filter((p) => p.individual).length,
      collective: new Set(
        honored.filter((p) => !p.individual).map((p) => p.slotId),
      ).size,
      educationalDiagnoses: honored.filter((p) =>
        isRole('diagnosticEducatif', p.thematicName),
      ).length,
      finalReviews: honored.filter((p) =>
        isRole('reactualisation', p.thematicName),
      ).length,
    },
    hoursBySoignant: hoursBySoignant(honored),
  }
}

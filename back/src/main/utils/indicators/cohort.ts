import type { AppointmentType, ThematicRole } from '../../../generated/client'

export type PresenceStatus = 'yes' | 'no' | null

export type CohortPresence = {
  patientId: string
  date: Date
  type: AppointmentType | null
  individual: boolean
  slotId: string
  thematicName: string | null
  thematicRole: ThematicRole | null
  honored: boolean
  accompanied: boolean
  status: PresenceStatus
  pathwayId: string | null
  pathwayLabel: string | null
  pathwayTemplateId: string | null
  slotMinutes: number
  soignants: string[]
}

export type CohortFile = {
  patientId: string
  entryDate: Date | null
  exitDate: Date | null
  // data et clinicalData fusionnés
  values: Record<string, unknown>
  presences: CohortPresence[]
}

// `files` : les sous-dossiers du service, pour les indicateurs qui comptent des PATIENTS pris
// en charge. `presences` : TOUS les rendez-vous du service, pour ceux qui comptent des SÉANCES
// RÉALISÉES — un `AppointmentPatient` s'écrit sans `PatientServiceFile` (décision assumée du
// dépôt, voir `ensureExists`), et une séance tenue pour un tel patient a bien eu lieu.
export type IndicatorCohort = {
  from: Date
  to: Date
  files: CohortFile[]
  presences: CohortPresence[]
}

// Formes minimales : l'ancienne grille d'`ars-indicators.ts` partage ces fonctions tant qu'elle existe.
type Dossier = Pick<CohortFile, 'entryDate' | 'presences'>
type Periode = Pick<IndicatorCohort, 'from' | 'to'>
type Seances = Pick<IndicatorCohort, 'from' | 'to' | 'presences'>

export const inRange = (date: Date | null, from: Date, to: Date): boolean =>
  date !== null && date >= from && date <= to

export const isRole = (role: ThematicRole, p: CohortPresence): boolean =>
  p.thematicRole === role

export const honored = (file: Dossier): CohortPresence[] =>
  file.presences.filter((p) => p.honored)

// Date du diagnostic éducatif : la date d'entrée du dossier si elle tombe dans la période, sinon
// le premier rendez-vous honoré de thématique « diagnostic éducatif » dans la période.
export const deDate = (file: Dossier, c: Periode): Date | null => {
  if (inRange(file.entryDate, c.from, c.to)) {
    return file.entryDate
  }
  const dates = honored(file)
    .filter(
      (p) => inRange(p.date, c.from, c.to) && isRole('DIAGNOSTIC_EDUCATIF', p),
    )
    .map((p) => p.date.getTime())
  return dates.length > 0 ? new Date(Math.min(...dates)) : null
}

// Les présences honorées entre la date de DE et la fin de période. `null` sans date de DE.
export const sinceDe = (file: Dossier, c: Periode): CohortPresence[] | null => {
  const start = deDate(file, c)
  if (start === null) {
    return null
  }
  return honored(file).filter((p) => p.date >= start && p.date <= c.to)
}

export const onlyOfTypes = (
  file: Dossier,
  c: Periode,
  types: readonly AppointmentType[],
): boolean => {
  const ps = sinceDe(file, c)
  return (
    ps !== null &&
    ps.length > 0 &&
    ps.every((p) => p.type !== null && types.includes(p.type))
  )
}

export const presencesInPeriod = (c: Seances): CohortPresence[] =>
  c.presences.filter((p) => p.honored && inRange(p.date, c.from, c.to))

export const collectiveSlots = (c: Seances): Map<string, CohortPresence[]> => {
  const slots = new Map<string, CohortPresence[]>()
  for (const p of presencesInPeriod(c).filter((p) => !p.individual)) {
    slots.set(p.slotId, [...(slots.get(p.slotId) ?? []), p])
  }
  return slots
}

export const isReactu = (p: CohortPresence): boolean =>
  isRole('REACTUALISATION', p)

// Programme complet : un diagnostic éducatif, au moins une séance et au moins une
// réactualisation après lui.
export const completeProgram = (
  file: Dossier,
  c: Periode,
  types?: readonly AppointmentType[],
): boolean => {
  const ps = sinceDe(file, c)
  if (ps === null) {
    return false
  }
  if (types && !ps.every((p) => p.type !== null && types.includes(p.type))) {
    return false
  }
  return ps.some((p) => !isReactu(p)) && ps.some(isReactu)
}

export const reactuTimes = (ps: CohortPresence[]): number[] =>
  ps.filter(isReactu).map((p) => p.date.getTime())

export const countAround = (
  file: Dossier,
  c: Periode,
  pick: (times: number[], all: number[]) => number,
): number => {
  const ps = sinceDe(file, c)
  if (ps === null) {
    return 0
  }
  const times = reactuTimes(ps)
  if (times.length === 0) {
    return 0
  }
  return pick(
    times,
    ps.map((p) => p.date.getTime()),
  )
}

const UN_JOUR_MS = 24 * 60 * 60 * 1000

// La borne haute désigne un JOUR, pas un instant : « 2026-12-31 » arrive à minuit, et sans cela
// une séance tenue ce jour-là l'après-midi tomberait hors période — l'enquête perdrait son dernier
// jour, tous les ans, sans rien signaler.
// ponytail: fin de journée en UTC ; le fuseau de l'établissement n'est pas modélisé, il reste donc
// un décalage d'une heure en hiver. À reprendre le jour où un fuseau est porté par l'établissement.
export const finDeJournee = (to: Date): Date =>
  new Date(to.getTime() + UN_JOUR_MS - 1)

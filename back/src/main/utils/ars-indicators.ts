import type { AppointmentType } from '../../generated/client'

// Rattachement des thématiques à leur rôle dans la grille ARS. Liste nommée et non préfixe : les
// quatre libellés de diagnostic éducatif des données réelles diffèrent par la casse de l'accent.
// ponytail: constante pour le pilote ; devient un réglage par service (champ de rôle sur
// `Thematic`) quand le chef de service doit le changer lui-même — les `compute` ne bougeront pas,
// ils reçoivent déjà des rôles résolus.
export const ARS_THEMATIC_ROLES = {
  reactualisation: ['Réactu 1', 'Réactu 2', 'Réactu 3', 'Réactu 4'],
  diagnosticEducatif: [
    'Diagnostic éducatif',
    'Diagnostic Éducatif – Bilan CEPTA',
    'Diagnostic Éducatif – HDJ SMR',
    'Diagnostic Éducatif – Ambulatoire',
  ],
} as const

type ThematicRole = keyof typeof ARS_THEMATIC_ROLES

export type ArsPresence = {
  date: Date
  type: AppointmentType | null
  individual: boolean
  slotId: string
  thematicName: string | null
  honored: boolean
  accompanied: boolean
}

export type ArsFile = {
  patientId: string
  entryDate: Date | null
  orientation: string | null
  presences: ArsPresence[]
}

export type ArsCohort = { from: Date; to: Date; files: ArsFile[] }

export type ArsGroup = 'Entrée' | 'Séances' | 'Sortie' | 'Modalités'

export type ArsIndicator = {
  code: string
  group: ArsGroup
  label: string
} & (
  | { compute: (cohort: ArsCohort) => number }
  | { unavailable: string }
  | { manual: string }
)

export type ArsIndicatorResult = {
  code: string
  group: ArsGroup
  label: string
  value: number | null
  note: string | null
}

const inRange = (date: Date | null, from: Date, to: Date): boolean =>
  date !== null && date >= from && date <= to

const isRole = (role: ThematicRole, name: string | null): boolean =>
  name !== null && (ARS_THEMATIC_ROLES[role] as readonly string[]).includes(name)

const honored = (file: ArsFile): ArsPresence[] =>
  file.presences.filter((p) => p.honored)

// Date du diagnostic éducatif : la date d'entrée du dossier si elle tombe dans la période, sinon
// le premier rendez-vous honoré de thématique « diagnostic éducatif » dans la période.
const deDate = (file: ArsFile, c: ArsCohort): Date | null => {
  if (inRange(file.entryDate, c.from, c.to)) {
    return file.entryDate
  }
  const dates = honored(file)
    .filter(
      (p) =>
        inRange(p.date, c.from, c.to) &&
        isRole('diagnosticEducatif', p.thematicName),
    )
    .map((p) => p.date.getTime())
  return dates.length > 0 ? new Date(Math.min(...dates)) : null
}

const countFiles = (c: ArsCohort, keep: (f: ArsFile) => boolean): number =>
  c.files.filter(keep).length

const countOriented = (c: ArsCohort, orientation: string): number =>
  countFiles(
    c,
    (f) => deDate(f, c) !== null && f.orientation === orientation,
  )

export const ARS_INDICATORS: readonly ArsIndicator[] = [
  {
    code: '1.1',
    group: 'Entrée',
    label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
    compute: (c) => countFiles(c, (f) => deDate(f, c) !== null),
  },
  {
    code: '1.1bis',
    group: 'Entrée',
    label:
      "Dont nombre de patients ayant bénéficié d'un diagnostic éducatif en distanciel",
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          deDate(f, c) !== null &&
          honored(f).some(
            (p) =>
              inRange(p.date, c.from, c.to) &&
              isRole('diagnosticEducatif', p.thematicName) &&
              p.type === 'telephonic',
          ),
      ),
  },
  {
    code: '1.2',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé en dehors d'un hôpital (dont médecin traitant)",
    compute: (c) => countOriented(c, 'Orientation pro santé ext hôpital'),
  },
  {
    code: '1.3',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé au cours d'une hospitalisation",
    compute: (c) => countOriented(c, 'Orientation pro santé au cours hospit'),
  },
  {
    code: '1.4',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé à l'hôpital en consultation externe",
    compute: (c) => countOriented(c, 'Orientation pro santé en Cs'),
  },
]

export const computeArsIndicators = (c: ArsCohort): ArsIndicatorResult[] =>
  ARS_INDICATORS.map((i) => {
    const base = { code: i.code, group: i.group, label: i.label }
    if ('compute' in i) {
      return { ...base, value: i.compute(c), note: null }
    }
    if ('unavailable' in i) {
      return { ...base, value: null, note: i.unavailable }
    }
    return { ...base, value: null, note: i.manual }
  })

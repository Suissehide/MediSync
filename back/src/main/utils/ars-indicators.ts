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

// Les trois orientations de la grille, par la CLÉ que la base stocke. `toSelectOptions`
// (`front/src/libs/utils.ts`) écrit la clé du dictionnaire `ORIENTATION`, jamais son libellé :
// comparer le libellé rendait 1.2, 1.3 et 1.4 nuls sur un établissement qui en a des milliers.
// `ars-indicators.test.ts` tient ces trois clés contre le dictionnaire du front.
export const ARS_ORIENTATIONS = {
  horsHopital: 'ORIENTATION_PRO_SANTE_EXT',
  hospitalisation: 'ORIENTATION_PRO_SANTE_HOSPIT',
  consultationExterne: 'ORIENTATION_PRO_SANTE_CS',
} as const

// Même piège que les orientations : `APPOINTMENT_ACCOMPANYING` est un dictionnaire clé→libellé et
// c'est la CLÉ qui est stockée, jamais « Oui ».
export const ARS_ACCOMPANYING_YES = 'yes'

export type ArsPresence = {
  patientId: string
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

// `files` : les sous-dossiers du service, pour les indicateurs qui comptent des PATIENTS pris
// en charge. `presences` : TOUS les rendez-vous du service, pour ceux qui comptent des SÉANCES
// RÉALISÉES — un `AppointmentPatient` s'écrit sans `PatientServiceFile` (décision assumée du
// dépôt, voir `ensureExists`), et une séance tenue pour un tel patient a bien eu lieu.
export type ArsCohort = {
  from: Date
  to: Date
  files: ArsFile[]
  presences: ArsPresence[]
}

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
  name !== null &&
  (ARS_THEMATIC_ROLES[role] as readonly string[]).includes(name)

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
  countFiles(c, (f) => deDate(f, c) !== null && f.orientation === orientation)

// Les présences honorées entre la date de DE et la fin de période. `null` sans date de DE.
const sinceDe = (file: ArsFile, c: ArsCohort): ArsPresence[] | null => {
  const start = deDate(file, c)
  if (start === null) {
    return null
  }
  return honored(file).filter((p) => p.date >= start && p.date <= c.to)
}

const onlyOfTypes = (
  file: ArsFile,
  c: ArsCohort,
  types: readonly AppointmentType[],
): boolean => {
  const ps = sinceDe(file, c)
  return (
    ps !== null &&
    ps.length > 0 &&
    ps.every((p) => p.type !== null && types.includes(p.type))
  )
}

const presencesInPeriod = (c: ArsCohort): ArsPresence[] =>
  c.presences.filter((p) => p.honored && inRange(p.date, c.from, c.to))

const collectiveSlots = (c: ArsCohort): Map<string, ArsPresence[]> => {
  const slots = new Map<string, ArsPresence[]>()
  for (const p of presencesInPeriod(c).filter((p) => !p.individual)) {
    slots.set(p.slotId, [...(slots.get(p.slotId) ?? []), p])
  }
  return slots
}

const isReactu = (p: ArsPresence): boolean =>
  isRole('reactualisation', p.thematicName)

// Programme complet : un diagnostic éducatif, au moins une séance et au moins une
// réactualisation après lui.
const completeProgram = (
  file: ArsFile,
  c: ArsCohort,
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

const reactuTimes = (ps: ArsPresence[]): number[] =>
  ps.filter(isReactu).map((p) => p.date.getTime())

const countAround = (
  file: ArsFile,
  c: ArsCohort,
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
    compute: (c) => countOriented(c, ARS_ORIENTATIONS.horsHopital),
  },
  {
    code: '1.3',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé au cours d'une hospitalisation",
    compute: (c) => countOriented(c, ARS_ORIENTATIONS.hospitalisation),
  },
  {
    code: '1.4',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé à l'hôpital en consultation externe",
    compute: (c) => countOriented(c, ARS_ORIENTATIONS.consultationExterne),
  },
  {
    code: '2.1',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge au cours d'une hospitalisation (de jour, de semaine, complète) en établissement de santé uniquement",
    compute: (c) => countFiles(c, (f) => onlyOfTypes(f, c, ['hospital'])),
  },
  {
    code: '2.2',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge en soins externes d'un établissement de santé uniquement",
    compute: (c) =>
      countFiles(c, (f) => onlyOfTypes(f, c, ['ambulatory', 'telephonic'])),
  },
  {
    code: '2.3',
    group: 'Séances',
    label:
      'Nombre de patients pris en charge en soins de ville uniquement (MSP, association, ex-réseau de PS libéraux…)',
    unavailable:
      'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
  },
  {
    code: '2.4',
    group: 'Séances',
    label:
      'Nombre de patients pris en charge en programme mixte (hospitalisation + soins externes)',
    compute: (c) =>
      countFiles(c, (f) => {
        const ps = sinceDe(f, c)
        return (
          ps !== null &&
          ps.length > 0 &&
          !onlyOfTypes(f, c, ['hospital']) &&
          !onlyOfTypes(f, c, ['ambulatory', 'telephonic'])
        )
      }),
  },
  {
    code: '2.5',
    group: 'Séances',
    label: 'Autre type de prise en charge à chiffrer et à expliquer',
    manual: "Champ libre de l'enquête, à renseigner à la main",
  },
  {
    code: '2.6',
    group: 'Séances',
    label: "Nombre total de séances individuelles d'ETP réalisées",
    compute: (c) => presencesInPeriod(c).filter((p) => p.individual).length,
  },
  {
    code: '2.6bis',
    group: 'Séances',
    label: "Dont nombre de séances individuelles d'ETP réalisées en distanciel",
    compute: (c) =>
      presencesInPeriod(c).filter(
        (p) => p.individual && p.type === 'telephonic',
      ).length,
  },
  {
    code: '2.7',
    group: 'Séances',
    label: "Nombre total de séances collectives d'ETP réalisées",
    compute: (c) => collectiveSlots(c).size,
  },
  {
    code: '2.7bis',
    group: 'Séances',
    label: "Dont nombre de séances collectives d'ETP réalisées en distanciel",
    compute: (c) =>
      [...collectiveSlots(c).values()].filter((ps) =>
        ps.every((p) => p.type === 'telephonic'),
      ).length,
  },
  {
    code: '2.8',
    group: 'Séances',
    label: 'Nombre moyen de patients par séance collective',
    compute: (c) => {
      const slots = collectiveSlots(c)
      if (slots.size === 0) {
        return 0
      }
      const total = [...slots.values()].reduce((n, ps) => n + ps.length, 0)
      return Math.round((total / slots.size) * 10) / 10
    },
  },
  {
    code: '2.9',
    group: 'Séances',
    label:
      'Nombre de proches et/ou aidants du patient ayant participé au programme',
    // Faute de pouvoir identifier les proches eux-mêmes (`accompanying` est un Oui/Non), on compte
    // les patients distincts ayant été accompagnés au moins une fois — là où 2.10 compte des
    // séances. Draxa recopiait 2.10 ici.
    compute: (c) =>
      new Set(
        presencesInPeriod(c)
          .filter((p) => p.accompanied)
          .map((p) => p.patientId),
      ).size,
  },
  {
    code: '2.10',
    group: 'Séances',
    label:
      "Nombre total de séances d'ETP avec une participation de proches et/ou aidants du patient",
    compute: (c) => presencesInPeriod(c).filter((p) => p.accompanied).length,
  },
  {
    code: '2.11',
    group: 'Séances',
    label:
      'Nombre total de séances destinées exclusivement aux proches et/ou aidants du patient',
    unavailable:
      'Un rendez-vous est toujours rattaché à des patients : une séance sans patient ne se représente pas',
  },
  {
    code: '3.1',
    group: 'Sortie',
    label:
      'Nombre de patients ayant suivi un programme personnalisé complet (quel que soit le mode de prise en charge)',
    compute: (c) => countFiles(c, (f) => completeProgram(f, c)),
  },
  {
    code: '3.2',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une hospitalisation complète ou de jour)",
    compute: (c) => countFiles(c, (f) => completeProgram(f, c, ['hospital'])),
  },
  {
    code: '3.3',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une venue en soins externes)",
    compute: (c) => countFiles(c, (f) => completeProgram(f, c, ['ambulatory'])),
  },
  {
    code: '3.4',
    group: 'Sortie',
    label:
      'Nombre de patients ayant suivi un programme personnalisé complet (au cours d’une venue mixte)',
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          completeProgram(f, c) &&
          !completeProgram(f, c, ['hospital']) &&
          !completeProgram(f, c, ['ambulatory']),
      ),
  },
  {
    code: '3.5',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours de séances d'ETP pratiquées en soins de ville)",
    unavailable:
      'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
  },
  {
    code: '3.6',
    group: 'Sortie',
    label:
      "Nombre de patients ayant bénéficié d'une évaluation individuelle des compétences acquises de l'ETP",
    compute: (c) =>
      countFiles(c, (f) =>
        honored(f).some((p) => inRange(p.date, c.from, c.to) && isReactu(p)),
      ),
  },
  {
    code: '4.1',
    group: 'Modalités',
    label:
      "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre initiale d'ETP",
    compute: (c) => countFiles(c, (f) => (sinceDe(f, c)?.length ?? 0) >= 3),
  },
  {
    code: '4.1bis',
    group: 'Modalités',
    label:
      'Dont nombre de patients ayant terminé par une réactualisation (Réactu 1 à 4)',
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          countAround(
            f,
            c,
            (times, all) => all.filter((t) => t < Math.max(...times)).length,
          ) >= 3,
      ),
  },
  {
    code: '4.2',
    group: 'Modalités',
    label:
      'Une offre de suivi ou de renforcement dans un nouveau programme est-elle proposée au sein de la structure ?',
    manual: 'Question oui/non sur la structure, à renseigner à la main',
  },
  {
    code: '4.3',
    group: 'Modalités',
    label:
      "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre de suivi ou de renforcement d'ETP commençant par une réactualisation",
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          countAround(
            f,
            c,
            (times, all) => all.filter((t) => t > Math.min(...times)).length,
          ) >= 3,
      ),
  },
  {
    code: '4.3bis',
    group: 'Modalités',
    label:
      'Dont nombre de patients ayant également terminé par une réactualisation (Réactu 1 à 4)',
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          countAround(f, c, (times, all) => {
            if (times.length < 2) {
              return 0
            }
            const first = Math.min(...times)
            const last = Math.max(...times)
            return all.filter((t) => t > first && t < last).length
          }) >= 3,
      ),
  },
  {
    code: '4.4',
    group: 'Modalités',
    label:
      "Nombre de patients dont la synthèse de l'évaluation des compétences acquises a été transmise au moins à leur médecin traitant",
    unavailable:
      'Aucun modèle ne trace cet envoi (relève du ticket « Envoi du bilan par MSSanté »)',
  },
]

const UN_JOUR_MS = 24 * 60 * 60 * 1000

// La borne haute désigne un JOUR, pas un instant : « 2026-12-31 » arrive à minuit, et sans cela
// une séance tenue ce jour-là l'après-midi tomberait hors période — l'enquête perdrait son dernier
// jour, tous les ans, sans rien signaler.
// ponytail: fin de journée en UTC ; le fuseau de l'établissement n'est pas modélisé, il reste donc
// un décalage d'une heure en hiver. À reprendre le jour où un fuseau est porté par l'établissement.
const finDeJournee = (to: Date): Date => new Date(to.getTime() + UN_JOUR_MS - 1)

export const computeArsIndicators = (
  cohort: ArsCohort,
): ArsIndicatorResult[] => {
  const c: ArsCohort = { ...cohort, to: finDeJournee(cohort.to) }
  return ARS_INDICATORS.map((i) => {
    const base = { code: i.code, group: i.group, label: i.label }
    if ('compute' in i) {
      return { ...base, value: i.compute(c), note: null }
    }
    if ('unavailable' in i) {
      return { ...base, value: null, note: i.unavailable }
    }
    return { ...base, value: null, note: i.manual }
  })
}

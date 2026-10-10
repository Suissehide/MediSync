import { z } from 'zod'

import {
  type CohortFile,
  collectiveSlots,
  completeProgram,
  countAround,
  deDate,
  honored,
  type IndicatorCohort,
  inRange,
  isReactu,
  isRole,
  onlyOfTypes,
  presencesInPeriod,
  sinceDe,
} from './cohort'

export type MeasureUnit = 'patients' | 'seances' | 'moyenne'

export type Measure<O> = {
  label: string
  description: string
  unit: MeasureUnit
  options: z.ZodType<O>
  // Patients retenus (mesures 'patients') : sert aussi à la répartition.
  patients?: (c: IndicatorCohort, options: O) => CohortFile[]
  compute: (c: IndicatorCohort, options: O) => number
}

export type MeasureKey =
  | 'patientsEntres'
  | 'patientsParModalite'
  | 'seancesIndividuelles'
  | 'seancesCollectives'
  | 'moyennePatientsParSeanceCollective'
  | 'patientsAccompagnes'
  | 'seancesAvecProche'
  | 'patientsProgrammeComplet'
  | 'patientsEvalues'
  | 'patientsProgrammePersonnalise'
  | 'patientsSortis'
  | 'patientsSuivis'

// Les options brutes passent par le schéma (valeurs par défaut comprises) avant le calcul.
const measure = <O>(m: Measure<O>): Measure<unknown> => {
  const { patients } = m
  return {
    ...m,
    patients: patients && ((c, raw) => patients(c, m.options.parse(raw))),
    compute: (c, raw) => m.compute(c, m.options.parse(raw)),
  }
}

// Mesure qui compte des dossiers : `compute` est le nombre de patients retenus.
const patientMeasure = <O>(
  m: Omit<Measure<O>, 'unit' | 'compute' | 'patients'> & {
    patients: (c: IndicatorCohort, options: O) => CohortFile[]
  },
): Measure<unknown> =>
  measure({
    ...m,
    unit: 'patients',
    compute: (c, o) => m.patients(c, o).length,
  })

const fichiersDe = (c: IndicatorCohort, ids: Set<string>): CohortFile[] =>
  c.files.filter((f) => ids.has(f.patientId))

const patientsAccompagnes = (c: IndicatorCohort): Set<string> =>
  new Set(
    presencesInPeriod(c)
      .filter((p) => p.accompanied)
      .map((p) => p.patientId),
  )

const patientsSuivis = (c: IndicatorCohort): Set<string> =>
  new Set(presencesInPeriod(c).map((p) => p.patientId))

const mixte = (f: CohortFile, c: IndicatorCohort): boolean => {
  const ps = sinceDe(f, c)
  return (
    ps !== null &&
    ps.length > 0 &&
    !onlyOfTypes(f, c, ['hospital']) &&
    !onlyOfTypes(f, c, ['ambulatory', 'telephonic'])
  )
}

type Critere = (f: CohortFile, c: IndicatorCohort) => boolean

const PROGRAMME_COMPLET = {
  toutes: (f, c) => completeProgram(f, c),
  hospitalisation: (f, c) => completeProgram(f, c, ['hospital']),
  // Ambulatoire seul : le distanciel n'en fait pas partie, contrairement aux modalités.
  externes: (f, c) => completeProgram(f, c, ['ambulatory']),
  mixte: (f, c) =>
    completeProgram(f, c) &&
    !completeProgram(f, c, ['hospital']) &&
    !completeProgram(f, c, ['ambulatory']),
} satisfies Record<string, Critere>

const PROGRAMME_PERSONNALISE = {
  initial: (f, c) => (sinceDe(f, c)?.length ?? 0) >= 3,
  initialTermineParReactu: (f, c) =>
    countAround(
      f,
      c,
      (times, all) => all.filter((t) => t < Math.max(...times)).length,
    ) >= 3,
  suiviCommenceParReactu: (f, c) =>
    countAround(
      f,
      c,
      (times, all) => all.filter((t) => t > Math.min(...times)).length,
    ) >= 3,
  suiviReactuDebutEtFin: (f, c) =>
    countAround(f, c, (times, all) => {
      if (times.length < 2) {
        return 0
      }
      const first = Math.min(...times)
      const last = Math.max(...times)
      return all.filter((t) => t > first && t < last).length
    }) >= 3,
} satisfies Record<string, Critere>

const aDistance = z.object({ aDistance: z.boolean().default(false) })

export const MEASURES: Record<MeasureKey, Measure<unknown>> = {
  patientsEntres: patientMeasure({
    label: 'Patients entrés',
    description:
      "Patients dont le diagnostic éducatif tombe dans la période (date d'entrée, sinon premier rendez-vous de diagnostic éducatif honoré)",
    options: z.object({ diagnosticADistance: z.boolean().default(false) }),
    patients: (c, o) =>
      c.files.filter(
        (f) =>
          deDate(f, c) !== null &&
          (!o.diagnosticADistance ||
            honored(f).some(
              (p) =>
                inRange(p.date, c.from, c.to) &&
                isRole('DIAGNOSTIC_EDUCATIF', p) &&
                p.type === 'telephonic',
            )),
      ),
  }),
  patientsParModalite: patientMeasure({
    label: 'Patients par modalité de prise en charge',
    description:
      'Patients entrés selon le type de leurs rendez-vous depuis le diagnostic éducatif : hospitalisation seule, soins externes seuls (distanciel compris) ou mixte',
    options: z.object({
      modalite: z.enum(['hospitalisation', 'externes', 'mixte']),
    }),
    patients: (c, o) =>
      c.files.filter((f) =>
        o.modalite === 'hospitalisation'
          ? onlyOfTypes(f, c, ['hospital'])
          : o.modalite === 'externes'
            ? onlyOfTypes(f, c, ['ambulatory', 'telephonic'])
            : mixte(f, c),
      ),
  }),
  seancesIndividuelles: measure({
    label: 'Séances individuelles',
    description: 'Rendez-vous individuels honorés dans la période',
    unit: 'seances',
    options: aDistance,
    compute: (c, o) =>
      presencesInPeriod(c).filter(
        (p) => p.individual && (!o.aDistance || p.type === 'telephonic'),
      ).length,
  }),
  seancesCollectives: measure({
    label: 'Séances collectives',
    description:
      'Créneaux collectifs distincts avec au moins une présence honorée dans la période',
    unit: 'seances',
    options: aDistance,
    compute: (c, o) =>
      o.aDistance
        ? [...collectiveSlots(c).values()].filter((ps) =>
            ps.every((p) => p.type === 'telephonic'),
          ).length
        : collectiveSlots(c).size,
  }),
  moyennePatientsParSeanceCollective: measure({
    label: 'Moyenne de patients par séance collective',
    description:
      'Présences honorées aux séances collectives divisées par leur nombre, au dixième',
    unit: 'moyenne',
    options: z.object({}),
    compute: (c) => {
      const slots = collectiveSlots(c)
      if (slots.size === 0) {
        return 0
      }
      const total = [...slots.values()].reduce((n, ps) => n + ps.length, 0)
      return Math.round((total / slots.size) * 10) / 10
    },
  }),
  // Faute de pouvoir identifier les proches eux-mêmes (`accompanying` est un Oui/Non), on compte
  // les patients distincts accompagnés au moins une fois, avec ou sans dossier.
  patientsAccompagnes: measure({
    label: 'Patients accompagnés par un proche',
    description:
      'Patients distincts accompagnés au moins une fois à une séance honorée de la période',
    unit: 'patients',
    options: z.object({}),
    patients: (c) => fichiersDe(c, patientsAccompagnes(c)),
    compute: (c) => patientsAccompagnes(c).size,
  }),
  seancesAvecProche: measure({
    label: 'Séances avec un proche',
    description:
      'Présences honorées de la période où le patient était accompagné',
    unit: 'seances',
    options: z.object({}),
    compute: (c) => presencesInPeriod(c).filter((p) => p.accompanied).length,
  }),
  patientsProgrammeComplet: patientMeasure({
    label: 'Patients au programme complet',
    description:
      'Patients ayant, depuis le diagnostic éducatif, au moins une séance et une réactualisation ; restreint au type de prise en charge selon la modalité',
    options: z.object({
      modalite: z.enum(['toutes', 'hospitalisation', 'externes', 'mixte']),
    }),
    patients: (c, o) =>
      c.files.filter((f) => PROGRAMME_COMPLET[o.modalite](f, c)),
  }),
  patientsEvalues: patientMeasure({
    label: 'Patients évalués',
    description:
      'Patients ayant eu une réactualisation honorée dans la période',
    options: z.object({}),
    patients: (c) =>
      c.files.filter((f) =>
        honored(f).some((p) => inRange(p.date, c.from, c.to) && isReactu(p)),
      ),
  }),
  patientsProgrammePersonnalise: patientMeasure({
    label: 'Patients au programme personnalisé',
    description:
      'Patients ayant au moins trois séances honorées : depuis le diagnostic éducatif, avant la dernière réactualisation, après la première, ou entre la première et la dernière',
    options: z.object({
      variante: z.enum([
        'initial',
        'initialTermineParReactu',
        'suiviCommenceParReactu',
        'suiviReactuDebutEtFin',
      ]),
    }),
    patients: (c, o) =>
      c.files.filter((f) => PROGRAMME_PERSONNALISE[o.variante](f, c)),
  }),
  patientsSortis: patientMeasure({
    label: 'Patients sortis',
    description: 'Patients dont la date de sortie tombe dans la période',
    options: z.object({}),
    patients: (c) => c.files.filter((f) => inRange(f.exitDate, c.from, c.to)),
  }),
  patientsSuivis: measure({
    label: 'Patients suivis',
    description:
      'Patients distincts avec au moins une présence honorée dans la période, avec ou sans dossier',
    unit: 'patients',
    options: z.object({}),
    patients: (c) => fichiersDe(c, patientsSuivis(c)),
    compute: (c) => patientsSuivis(c).size,
  }),
}

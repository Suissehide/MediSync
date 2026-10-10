import { ETP_FIELD_PRESET } from '../../../../main/utils/etp-field-preset'
import {
  ARS_ORIENTATIONS,
  ARS_PRESET,
  type IndicatorConfig,
} from '../../../../main/utils/indicators/ars-preset'
import {
  type CohortFile,
  type CohortPresence,
  finDeJournee,
  type IndicatorCohort,
} from '../../../../main/utils/indicators/cohort'
import { applyFilters } from '../../../../main/utils/indicators/filters'
import { MEASURES } from '../../../../main/utils/indicators/measures'
import { readChoice } from '../../../../main/utils/service-field-types'
import { type ArsCohort, computeArsIndicators } from './ars-oracle'

let creneau = 0
const presence = (p: Partial<CohortPresence>): CohortPresence => ({
  patientId: 'p1',
  date: new Date('2026-03-01T10:00:00Z'),
  type: 'ambulatory',
  individual: true,
  slotId: `slot-${creneau++}`,
  thematicName: 'Mes médicaments',
  thematicRole: null,
  honored: true,
  accompanied: false,
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  pathwayTemplateId: null,
  slotMinutes: 60,
  soignants: [],
  ...p,
})

const de = (patientId: string, date: string, p: Partial<CohortPresence> = {}) =>
  presence({
    patientId,
    date: new Date(date),
    thematicRole: 'DIAGNOSTIC_EDUCATIF',
    ...p,
  })
const seance = (
  patientId: string,
  date: string,
  p: Partial<CohortPresence> = {},
) => presence({ patientId, date: new Date(date), ...p })
const reactu = (
  patientId: string,
  date: string,
  p: Partial<CohortPresence> = {},
) =>
  presence({
    patientId,
    date: new Date(date),
    thematicRole: 'REACTUALISATION',
    ...p,
  })

// Cohorte où les options sœurs d'une même mesure donnent des valeurs distinctes : intervertir deux options se voit.
const presencesParPatient: Record<string, CohortPresence[]> = {
  hosp: [
    seance('hosp', '2026-03-01', { type: 'hospital' }),
    seance('hosp', '2026-03-12', {
      slotId: 'atelier-2',
      individual: false,
      type: 'hospital',
    }),
    reactu('hosp', '2026-06-01', { type: 'hospital' }),
  ],
  ext: [
    de('ext', '2026-03-10', { type: 'telephonic' }),
    seance('ext', '2026-03-20', {
      slotId: 'atelier-tel',
      individual: false,
      type: 'telephonic',
    }),
    seance('ext', '2026-04-01'),
    seance('ext', '2026-04-15', { accompanied: true }),
    reactu('ext', '2026-05-01'),
  ],
  mixte: [
    reactu('mixte', '2026-02-01', { type: 'hospital' }),
    seance('mixte', '2026-02-10', { type: 'hospital' }),
    seance('mixte', '2026-03-10', { slotId: 'atelier-1', individual: false }),
    seance('mixte', '2026-04-10'),
    reactu('mixte', '2026-05-10'),
    seance('mixte', '2026-06-10', { honored: false, status: 'no' }),
  ],
  amb: [
    seance('amb', '2026-03-10', {
      slotId: 'atelier-1',
      individual: false,
      accompanied: true,
    }),
    reactu('amb', '2026-04-01'),
    seance('amb', '2026-04-20', { accompanied: true }),
  ],
  suivi: [
    reactu('suivi', '2026-03-05', { type: 'hospital' }),
    seance('suivi', '2026-03-15', { type: 'hospital' }),
    seance('suivi', '2026-03-25', { type: 'hospital' }),
    seance('suivi', '2026-04-05', { type: 'hospital', accompanied: true }),
  ],
  cs2: [
    seance('cs2', '2026-04-05', { type: 'hospital' }),
    seance('cs2', '2026-03-12', {
      slotId: 'atelier-2',
      individual: false,
      type: 'hospital',
    }),
    seance('cs2', '2026-04-15', { type: 'hospital' }),
    reactu('cs2', '2026-05-15', { type: 'hospital' }),
  ],
  ancien: [
    seance('ancien', '2026-03-10', { slotId: 'atelier-1', individual: false }),
  ],
  sansDossier: [
    seance('sansDossier', '2026-03-20', {
      slotId: 'atelier-tel',
      individual: false,
      type: 'telephonic',
    }),
    seance('sansDossier', '2026-07-01', {
      type: 'telephonic',
      accompanied: true,
    }),
  ],
}

const dossier = (
  patientId: string,
  entryDate: string | null,
  values: Record<string, unknown>,
  exitDate: string | null = null,
): CohortFile => ({
  patientId,
  entryDate: entryDate === null ? null : new Date(entryDate),
  exitDate: exitDate === null ? null : new Date(exitDate),
  values,
  presences: presencesParPatient[patientId] ?? [],
})

const cohorte: IndicatorCohort = {
  from: new Date('2026-01-01'),
  to: new Date('2026-12-31'),
  files: [
    dossier('hosp', '2026-02-01', {
      orientation: ARS_ORIENTATIONS.horsHopital,
    }),
    dossier('ext', null, {
      orientation: ARS_ORIENTATIONS.hospitalisation,
      medicalDiagnosis: 'DIABETE',
    }),
    dossier('mixte', '2026-01-15', {
      orientation: ARS_ORIENTATIONS.consultationExterne,
    }),
    dossier(
      'amb',
      '2026-02-10',
      {
        orientation: 'VENUE_SPONTANEE',
        stopReason: 'PLUS_BESOIN_FIN_PARCOURS',
      },
      '2026-11-01',
    ),
    dossier('suivi', '2026-03-01', {
      orientation: ARS_ORIENTATIONS.horsHopital,
    }),
    dossier('cs2', '2026-03-01', {
      orientation: ARS_ORIENTATIONS.consultationExterne,
    }),
    // Entrées sans séance : elles n'écartent que les comptes d'orientation les uns des autres.
    dossier('o1', '2026-05-01', {
      orientation: ARS_ORIENTATIONS.hospitalisation,
    }),
    dossier('o2', '2026-05-02', {
      orientation: ARS_ORIENTATIONS.hospitalisation,
    }),
    dossier('o3', '2026-05-03', {
      orientation: ARS_ORIENTATIONS.consultationExterne,
    }),
    dossier('o4', '2026-05-04', {
      orientation: ARS_ORIENTATIONS.consultationExterne,
    }),
    dossier('ancien', '2025-02-01', {}),
  ],
  presences: Object.values(presencesParPatient).flat(),
}

const versAncienneCohorte = (c: IndicatorCohort): ArsCohort => ({
  from: c.from,
  to: c.to,
  presences: c.presences,
  files: c.files.map((f) => ({
    patientId: f.patientId,
    entryDate: f.entryDate,
    exitDate: f.exitDate,
    stopReason: readChoice(f.values, 'stopReason'),
    orientation: readChoice(f.values, 'orientation'),
    presences: f.presences,
  })),
})

const computeIndicatorValue = (
  c: IndicatorCohort,
  config: IndicatorConfig,
): number => {
  if (!config.measure) {
    throw new Error(`${config.code} : mesure absente`)
  }
  // L'appelant de MEASURES étend la borne haute à la fin du jour, comme `computeArsIndicators`.
  const borne = { ...c, to: finDeJournee(c.to) }
  return MEASURES[config.measure].compute(
    applyFilters(borne, config.filters ?? []),
    config.options ?? {},
  )
}

describe('jeu « Grille ARS » calculé par le moteur', () => {
  it('le jeu ARS calcule par le moteur egale l ancienne grille, code par code', () => {
    const attendu = computeArsIndicators(versAncienneCohorte(cohorte))
    for (const config of ARS_PRESET) {
      const ancien = attendu.find((r) => r.code === config.code)
      expect({
        code: config.code,
        label: config.label,
        group: config.group,
      }).toEqual({
        code: ancien?.code,
        label: ancien?.label,
        group: ancien?.group,
      })
      if (config.nature === 'computed') {
        expect({
          code: config.code,
          value: computeIndicatorValue(cohorte, config),
        }).toEqual({
          code: config.code,
          value: ancien?.value,
        })
      } else {
        expect({
          code: config.code,
          nature: config.nature,
          note: config.note,
        }).toEqual({
          code: config.code,
          nature: ancien?.kind,
          note: ancien?.note,
        })
      }
    }
    expect(ARS_PRESET.map((c) => c.code)).toEqual(attendu.map((r) => r.code))
  })

  // Une cohorte trop pauvre rendrait l'égalité triviale : chaque valeur calculée attendue est non nulle.
  it('la cohorte donne une valeur non nulle a chaque indicateur calcule', () => {
    const nuls = computeArsIndicators(versAncienneCohorte(cohorte))
      .filter((r) => r.kind === 'computed' && r.value === 0)
      .map((r) => r.code)
    expect(nuls).toEqual([])
  })

  // 2.9 et 2.10 ont des mesures différentes mais se confondaient chez Draxa : elles comptent comme sœurs.
  it('les codes d une meme mesure ont des valeurs attendues deux a deux distinctes', () => {
    const attendu = computeArsIndicators(versAncienneCohorte(cohorte))
    const soeurs = new Map<string, string[]>([['2.9/2.10', ['2.9', '2.10']]])
    for (const config of ARS_PRESET) {
      if (config.measure) {
        soeurs.set(config.measure, [
          ...(soeurs.get(config.measure) ?? []),
          config.code,
        ])
      }
    }
    const collisions = [...soeurs.entries()].flatMap(([groupe, codes]) => {
      const valeurs = codes.map(
        (code) => attendu.find((r) => r.code === code)?.value,
      )
      return new Set(valeurs).size === valeurs.length
        ? []
        : [
            `${groupe} : ${codes.map((c, i) => `${c}=${valeurs[i]}`).join(', ')}`,
          ]
    })
    expect(collisions).toEqual([])
  })

  it('2.8 arrondit la moyenne au dixieme', () => {
    const attendu = computeArsIndicators(versAncienneCohorte(cohorte))
    expect(attendu.find((r) => r.code === '2.8')?.value).toBe(2.3)
  })

  it('chaque mesure patients compte ses patients retenus, sauf celles qui comptent des presences', () => {
    const borne = { ...cohorte, to: finDeJournee(cohorte.to) }
    for (const config of ARS_PRESET) {
      const measure = config.measure ? MEASURES[config.measure] : null
      if (!measure?.patients || !config.measure) {
        continue
      }
      const retenus = measure.patients(borne, config.options ?? {})
      if (config.measure === 'patientsAccompagnes') {
        expect(retenus.map((f) => f.patientId)).toEqual(['ext', 'amb', 'suivi'])
      } else {
        expect(retenus.length).toBe(
          measure.compute(borne, config.options ?? {}),
        )
      }
    }
  })

  it('patientsSortis et patientsSuivis comptent les sortis et les patients vus', () => {
    const borne = { ...cohorte, to: finDeJournee(cohorte.to) }
    expect(MEASURES.patientsSortis.compute(borne, {})).toBe(1)
    expect(MEASURES.patientsSuivis.compute(borne, {})).toBe(8)
    expect(MEASURES.patientsSuivis.patients?.(borne, {}).length).toBe(7)
  })
})

describe('orientations de la grille', () => {
  // ETP_FIELD_PRESET sème les choix initiaux de ServiceFieldChoice : une clé qui en dérive existe en base.
  it('chaque cle de ARS_ORIENTATIONS est un choix du champ orientation de ETP_FIELD_PRESET', () => {
    const champOrientation = ETP_FIELD_PRESET.find(
      (f) => f.key === 'orientation',
    )
    if (!champOrientation) {
      throw new Error('champ orientation introuvable dans ETP_FIELD_PRESET')
    }
    const clesDuPreset = champOrientation.choices.map((c) => c.key)
    for (const cle of Object.values(ARS_ORIENTATIONS)) {
      expect(clesDuPreset).toContain(cle)
    }
  })
})

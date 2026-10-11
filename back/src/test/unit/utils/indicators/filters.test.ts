import type {
  CohortFile,
  CohortPresence,
  IndicatorCohort,
} from '../../../../main/utils/indicators/cohort'
import {
  applyFilters,
  type FilterCondition,
} from '../../../../main/utils/indicators/filters'
import { MEASURES } from '../../../../main/utils/indicators/measures'

const presence = (patientId: string): CohortPresence => ({
  patientId,
  date: new Date('2026-03-01T10:00:00Z'),
  type: 'ambulatory',
  individual: true,
  slotId: `slot-${patientId}`,
  thematicName: null,
  thematicRole: 'DIAGNOSTIC_EDUCATIF',
  honored: true,
  accompanied: true,
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  pathwayTemplateId: null,
  slotMinutes: 60,
  soignants: [],
})

const dossier = (
  patientId: string,
  values: Record<string, unknown>,
): CohortFile => ({
  patientId,
  entryDate: new Date('2026-02-01'),
  exitDate: new Date('2026-06-01'),
  values,
  presences: [presence(patientId)],
})

const cohorte: IndicatorCohort = {
  from: new Date('2026-01-01'),
  to: new Date('2026-12-31'),
  files: [
    dossier('a', {
      orientation: 'MT',
      comorbidites: ['HTA', 'DIAB'],
      tabac: true,
      age: 40,
      inclusion: '2026-03-01',
    }),
    dossier('b', {
      orientation: 'HOSP',
      comorbidites: ['DIAB'],
      tabac: false,
      age: 60,
      inclusion: '2026-02-15',
    }),
    dossier('c', {
      orientation: 'MT',
      comorbidites: [],
      age: 75,
      inclusion: '2026-04-01',
    }),
    dossier('d', {}),
  ],
  presences: ['a', 'b', 'c', 'd', 'sansDossier'].map(presence),
}

const gardes = (...filters: FilterCondition[]): string[] =>
  applyFilters(cohorte, filters).files.map((f) => f.patientId)

describe('applyFilters', () => {
  it('in garde les patients dont le choix est dans la liste', () => {
    expect(gardes({ field: 'orientation', op: 'in', value: ['MT'] })).toEqual([
      'a',
      'c',
    ])
    expect(
      gardes({ field: 'orientation', op: 'in', value: ['AUTRE'] }),
    ).toEqual([])
  })

  it('containsAny garde les patients qui ont au moins une des valeurs', () => {
    expect(
      gardes({ field: 'comorbidites', op: 'containsAny', value: ['HTA'] }),
    ).toEqual(['a'])
    expect(
      gardes({
        field: 'comorbidites',
        op: 'containsAny',
        value: ['DIAB', 'X'],
      }),
    ).toEqual(['a', 'b'])
  })

  it('eq booleen ne retient pas un patient sans valeur', () => {
    expect(gardes({ field: 'tabac', op: 'eq', value: true })).toEqual(['a'])
    expect(gardes({ field: 'tabac', op: 'eq', value: false })).toEqual(['b'])
  })

  it('les comparaisons de nombres respectent les bornes', () => {
    expect(gardes({ field: 'age', op: 'eq', value: 60 })).toEqual(['b'])
    expect(gardes({ field: 'age', op: 'lt', value: 60 })).toEqual(['a'])
    expect(gardes({ field: 'age', op: 'lte', value: 60 })).toEqual(['a', 'b'])
    expect(gardes({ field: 'age', op: 'gt', value: 60 })).toEqual(['c'])
    expect(gardes({ field: 'age', op: 'gte', value: 60 })).toEqual(['b', 'c'])
    expect(gardes({ field: 'age', op: 'gt', value: 75 })).toEqual([])
  })

  it('before et after sont stricts sur les dates', () => {
    expect(
      gardes({ field: 'inclusion', op: 'before', value: '2026-03-01' }),
    ).toEqual(['b'])
    expect(
      gardes({ field: 'inclusion', op: 'after', value: '2026-03-01' }),
    ).toEqual(['c'])
  })

  it('deux conditions se combinent par ET', () => {
    expect(
      gardes(
        { field: 'orientation', op: 'in', value: ['MT'] },
        { field: 'age', op: 'gt', value: 50 },
      ),
    ).toEqual(['c'])
  })

  it('les presences des patients ecartes et sans dossier disparaissent avec un filtre', () => {
    const filtree = applyFilters(cohorte, [
      { field: 'orientation', op: 'in', value: ['MT'] },
    ])
    expect(filtree.presences.map((p) => p.patientId)).toEqual(['a', 'c'])
    expect(applyFilters(cohorte, []).presences.map((p) => p.patientId)).toEqual(
      ['a', 'b', 'c', 'd', 'sansDossier'],
    )
  })

  it('sans filtre, chaque mesure donne le meme resultat', () => {
    const options: Record<string, unknown> = {
      patientsParModalite: { modalite: 'externes' },
      patientsProgrammeComplet: { modalite: 'toutes' },
      patientsProgrammePersonnalise: { variante: 'initial' },
    }
    const sansFiltre = applyFilters(cohorte, [])
    for (const [key, m] of Object.entries(MEASURES)) {
      const o = options[key] ?? {}
      expect({ key, value: m.compute(sansFiltre, o) }).toEqual({
        key,
        value: m.compute(cohorte, o),
      })
    }
  })
})

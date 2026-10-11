import type {
  CohortFile,
  CohortPresence,
  IndicatorCohort,
} from '../../../../main/utils/indicators/cohort'
import {
  computeIndicator,
  EMPTY_KEY,
  type FieldDefinition,
  type IndicatorDefinition,
  validateIndicator,
} from '../../../../main/utils/indicators/compute'

const presence = (patientId: string, date: string): CohortPresence => ({
  patientId,
  date: new Date(date),
  type: 'ambulatory',
  individual: true,
  slotId: `slot-${patientId}`,
  thematicName: null,
  thematicRole: 'DIAGNOSTIC_EDUCATIF',
  honored: true,
  accompanied: false,
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  pathwayTemplateId: null,
  slotMinutes: 60,
  soignants: [],
})

// Entrée par un DE honoré le jour donné, sans date d'entrée.
const dossier = (
  patientId: string,
  values: Record<string, unknown>,
  date = '2026-03-01T10:00:00Z',
): CohortFile => ({
  patientId,
  entryDate: null,
  exitDate: null,
  values,
  presences: [presence(patientId, date)],
})

const files = [
  dossier('a', { orientation: 'MT', comorbidites: ['HTA', 'DIAB'], age: 40 }),
  dossier('b', { orientation: 'HOSP', comorbidites: ['DIAB'], age: 60 }),
  dossier('c', { orientation: 'MT', age: 75 }),
  dossier('d', { orientation: 'VIEUX' }),
  // Dernier jour de la période, l'après-midi : compte grâce à la fin de journée.
  dossier('e', { orientation: 'MT' }, '2026-12-31T15:00:00Z'),
]

const cohorte: IndicatorCohort = {
  from: new Date('2026-01-01'),
  to: new Date('2026-12-31'),
  files,
  presences: files.flatMap((f) => f.presences),
}

const ARCHIVE = new Date('2026-01-01')

const choix = (key: string, order: number, archivedAt: Date | null = null) => ({
  key,
  label: `Libellé ${key}`,
  order,
  archivedAt,
})

const champs: FieldDefinition[] = [
  {
    key: 'orientation',
    label: 'Orientation',
    type: 'choice',
    archivedAt: null,
    choices: [
      choix('HOSP', 2),
      choix('MT', 1),
      choix('VIEUX', 3, ARCHIVE),
      choix('MORT', 4, ARCHIVE),
      choix('AUTRE', 5),
    ],
  },
  {
    key: 'comorbidites',
    label: 'Comorbidités',
    type: 'multichoice',
    archivedAt: null,
    choices: [choix('HTA', 1), choix('DIAB', 2)],
  },
  { key: 'age', label: 'Âge', type: 'number', archivedAt: null, choices: [] },
  {
    key: 'tabac',
    label: 'Tabac',
    type: 'boolean',
    archivedAt: null,
    choices: [],
  },
  { key: 'debut', label: 'Début', type: 'date', archivedAt: null, choices: [] },
  { key: 'note', label: 'Note', type: 'text', archivedAt: null, choices: [] },
  {
    key: 'ancienChoix',
    label: 'Ancien choix',
    type: 'choice',
    archivedAt: ARCHIVE,
    choices: [choix('X', 1)],
  },
  {
    key: 'ancien',
    label: 'Ancien champ',
    type: 'number',
    archivedAt: ARCHIVE,
    choices: [],
  },
]

const calcule = (def: Partial<IndicatorDefinition>): IndicatorDefinition => ({
  nature: 'computed',
  measure: 'patientsEntres',
  options: {},
  filters: [],
  breakdownField: null,
  input: null,
  note: null,
  ...def,
})

describe('computeIndicator', () => {
  it('compte une mesure filtree, dernier jour de la periode compris', () => {
    expect(computeIndicator(cohorte, calcule({}), champs)).toEqual({
      value: 5,
      breakdown: null,
      warnings: [],
    })
    expect(
      computeIndicator(
        cohorte,
        calcule({
          filters: [{ field: 'orientation', op: 'in', value: ['MT'] }],
        }),
        champs,
      ),
    ).toEqual({ value: 3, breakdown: null, warnings: [] })
  })

  it('repartit sur un choix : choix actifs dans l ordre, archives avec effectif, non renseigne', () => {
    const avec = dossier('f', {})
    const c = {
      ...cohorte,
      files: [...cohorte.files, avec],
      presences: [...cohorte.presences, ...avec.presences],
    }
    const r = computeIndicator(
      c,
      calcule({ breakdownField: 'orientation' }),
      champs,
    )
    expect(r.value).toBe(6)
    expect(r.breakdown).toEqual([
      { key: 'MT', label: 'Libellé MT', value: 3 },
      { key: 'HOSP', label: 'Libellé HOSP', value: 1 },
      { key: 'VIEUX', label: 'Libellé VIEUX', value: 1 },
      { key: 'AUTRE', label: 'Libellé AUTRE', value: 0 },
      { key: EMPTY_KEY, label: 'Non renseigné', value: 1 },
    ])
    expect(r.breakdown?.reduce((n, row) => n + row.value, 0)).toBe(6)
  })

  it('repartit sur un choix multiple : un patient compte dans chacune de ses valeurs', () => {
    const r = computeIndicator(
      cohorte,
      calcule({ breakdownField: 'comorbidites' }),
      champs,
    )
    expect(r.value).toBe(5)
    expect(r.breakdown).toEqual([
      { key: 'HTA', label: 'Libellé HTA', value: 1 },
      { key: 'DIAB', label: 'Libellé DIAB', value: 2 },
      { key: EMPTY_KEY, label: 'Non renseigné', value: 3 },
    ])
    expect(r.breakdown?.reduce((n, row) => n + row.value, 0)).toBe(6)
  })

  it('un filtre sur un champ ou un choix archive calcule et avertit', () => {
    expect(
      computeIndicator(
        cohorte,
        calcule({ filters: [{ field: 'ancien', op: 'gt', value: 1 }] }),
        champs,
      ),
    ).toEqual({
      value: 0,
      breakdown: null,
      warnings: ['Filtre sur un champ archivé : Ancien champ'],
    })
    expect(
      computeIndicator(
        cohorte,
        calcule({
          filters: [{ field: 'orientation', op: 'in', value: ['VIEUX', 'MT'] }],
        }),
        champs,
      ),
    ).toEqual({
      value: 4,
      breakdown: null,
      warnings: ['Filtre sur un choix archivé : Libellé VIEUX'],
    })
  })

  it('les patients comptes sans dossier vont dans non renseigne', () => {
    const c = {
      ...cohorte,
      presences: [...cohorte.presences, presence('x', '2026-04-01T10:00:00Z')],
    }
    const r = computeIndicator(
      c,
      calcule({ measure: 'patientsSuivis', breakdownField: 'orientation' }),
      champs,
    )
    expect(r.value).toBe(6)
    expect(r.breakdown?.at(-1)).toEqual({
      key: EMPTY_KEY,
      label: 'Non renseigné',
      value: 1,
    })
    expect(r.breakdown?.reduce((n, row) => n + row.value, 0)).toBe(6)
  })

  it('avertit une seule fois par cause, et sur une repartition par un champ archive', () => {
    expect(
      computeIndicator(
        cohorte,
        calcule({
          filters: [
            { field: 'orientation', op: 'in', value: ['VIEUX'] },
            { field: 'orientation', op: 'in', value: ['VIEUX', 'MT'] },
          ],
          breakdownField: 'ancienChoix',
        }),
        champs,
      ).warnings,
    ).toEqual([
      'Filtre sur un choix archivé : Libellé VIEUX',
      'Répartition sur un champ archivé : Ancien choix',
    ])
  })

  it('manual et unavailable ne calculent rien', () => {
    const vide = { value: null, breakdown: null, warnings: [] }
    expect(
      computeIndicator(
        cohorte,
        calcule({ nature: 'manual', measure: null, input: 'yesno' }),
        champs,
      ),
    ).toEqual(vide)
    expect(
      computeIndicator(
        cohorte,
        calcule({ nature: 'unavailable', measure: null, note: 'n/a' }),
        champs,
      ),
    ).toEqual(vide)
  })
})

describe('validateIndicator', () => {
  const refuse = (def: Partial<IndicatorDefinition>, message: RegExp) => {
    expect(() => validateIndicator(calcule(def), champs)).toThrow(message)
    try {
      validateIndicator(calcule(def), champs)
    } catch (e) {
      expect(e).toMatchObject({ output: { statusCode: 400 } })
    }
  }

  it('refuse une mesure inconnue ou des options hors schema', () => {
    refuse({ measure: 'inconnue' }, /Mesure inconnue/)
    refuse({ measure: null }, /Mesure manquante/)
    refuse(
      { measure: 'patientsParModalite', options: { modalite: 'autre' } },
      /Options invalides/,
    )
  })

  it('refuse un filtre mal forme', () => {
    refuse(
      { filters: [{ field: 'absent', op: 'in', value: ['X'] }] },
      /Champ inconnu/,
    )
    refuse(
      { filters: [{ field: 'note', op: 'in', value: ['X'] }] },
      /non filtrable/,
    )
    refuse({ filters: [{ field: 'age', op: 'in', value: ['X'] }] }, /Opérateur/)
    refuse(
      { filters: [{ field: 'tabac', op: 'eq', value: 1 }] },
      /Valeur invalide/,
    )
    refuse(
      { filters: [{ field: 'age', op: 'eq', value: true }] },
      /Valeur invalide/,
    )
    refuse(
      { filters: [{ field: 'age', op: 'lt', value: 'x' }] },
      /Filtre invalide/,
    )
    refuse(
      { filters: [{ field: 'debut', op: 'after', value: '01/03/2026' }] },
      /Filtre invalide/,
    )
    refuse(
      { filters: [{ field: 'debut', op: 'after', value: '2026-02-30' }] },
      /Filtre invalide/,
    )
    refuse(
      { filters: [{ field: 'orientation', op: 'in', value: ['NON'] }] },
      /Choix inconnu/,
    )
    refuse(
      { filters: [{ field: 'orientation', op: 'in', value: [] }] },
      /Filtre invalide/,
    )
    refuse({ filters: 'orientation' }, /Filtre invalide/)
  })

  it('refuse une repartition mal formee', () => {
    refuse({ breakdownField: 'absent' }, /Champ inconnu/)
    refuse({ breakdownField: 'age' }, /Répartition/)
    refuse(
      { measure: 'seancesIndividuelles', breakdownField: 'orientation' },
      /Répartition/,
    )
  })

  it('refuse un manual sans input et un unavailable sans note', () => {
    refuse({ nature: 'manual', measure: null }, /Saisie/)
    refuse({ nature: 'unavailable', measure: null }, /Note/)
  })

  it('accepte un indicateur de chaque nature', () => {
    expect(() =>
      validateIndicator(
        calcule({
          options: { diagnosticADistance: true },
          filters: [
            { field: 'orientation', op: 'in', value: ['MT', 'VIEUX'] },
            { field: 'comorbidites', op: 'containsAny', value: ['HTA'] },
            { field: 'tabac', op: 'eq', value: false },
            { field: 'age', op: 'gte', value: 18 },
            { field: 'debut', op: 'before', value: '2026-06-01' },
          ],
          breakdownField: 'comorbidites',
        }),
        champs,
      ),
    ).not.toThrow()
    expect(() =>
      validateIndicator(
        calcule({ nature: 'manual', measure: null, input: 'number+text' }),
        champs,
      ),
    ).not.toThrow()
    expect(() =>
      validateIndicator(
        calcule({
          nature: 'unavailable',
          measure: null,
          note: 'Pas de donnée',
        }),
        champs,
      ),
    ).not.toThrow()
  })
})

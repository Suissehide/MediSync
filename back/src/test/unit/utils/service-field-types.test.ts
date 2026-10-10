import {
  choiceKeyFromLabel,
  type FieldDefinitionForValidation,
  fieldKeyFromLabel,
  mergeFieldPatch,
  readChoice,
} from '../../../main/utils/service-field-types'

const def = (
  over: Partial<FieldDefinitionForValidation> & { key: string },
): FieldDefinitionForValidation => ({
  type: 'text',
  clinical: false,
  archivedAt: null,
  choices: [],
  ...over,
})

const ARCHIVED = new Date('2026-01-01')
const defs = [
  def({ key: 'nom', type: 'text' }),
  def({ key: 'hba1c', type: 'number' }),
  def({ key: 'sortie', type: 'date' }),
  def({ key: 'tabac', type: 'boolean' }),
  def({
    key: 'orientation',
    type: 'choice',
    choices: [
      { key: 'A', archivedAt: null },
      { key: 'VIEUX', archivedAt: ARCHIVED },
    ],
  }),
  def({
    key: 'comorbidites',
    type: 'multichoice',
    choices: [
      { key: 'HTA', archivedAt: null },
      { key: 'DIABETE', archivedAt: null },
      { key: 'VIEUX', archivedAt: ARCHIVED },
    ],
  }),
  def({
    key: 'diag',
    type: 'choice',
    clinical: true,
    choices: [{ key: 'AVC', archivedAt: null }],
  }),
  def({ key: 'ancien', archivedAt: ARCHIVED }),
]

const merge = (
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  clinical = false,
) => mergeFieldPatch(defs, current, patch, clinical)

describe('mergeFieldPatch', () => {
  it('accepte une valeur valide par type', () => {
    expect(
      merge(
        {},
        {
          nom: 'Dupont',
          hba1c: 7.2,
          sortie: '2026-03-01',
          tabac: false,
          orientation: 'A',
          comorbidites: ['HTA', 'DIABETE'],
        },
      ),
    ).toEqual({
      nom: 'Dupont',
      hba1c: 7.2,
      sortie: '2026-03-01',
      tabac: false,
      orientation: 'A',
      comorbidites: ['HTA', 'DIABETE'],
    })
  })

  it.each([
    ['nom', 3],
    ['hba1c', '7'],
    ['hba1c', Number.POSITIVE_INFINITY],
    ['sortie', '01/03/2026'],
    ['sortie', '2026-02-30'],
    ['tabac', 'oui'],
    ['orientation', 'INCONNU'],
    ['comorbidites', ['HTA', 'HTA']],
    ['comorbidites', 'HTA'],
  ])('refuse %s = %p', (key, value) => {
    expect(() => merge({}, { [key]: value })).toThrow(/invalide/)
  })

  it('garde les cles absentes du correctif et efface sur null, chaine vide ou liste vide', () => {
    expect(
      merge(
        { nom: 'A', hba1c: 7, comorbidites: ['HTA'], orientation: 'A' },
        { nom: '', comorbidites: [], orientation: null },
      ),
    ).toEqual({ hba1c: 7 })
  })

  it('accepte un choix archive deja present, refuse un choix archive nouveau', () => {
    expect(merge({ orientation: 'VIEUX' }, { orientation: 'VIEUX' })).toEqual({
      orientation: 'VIEUX',
    })
    expect(() => merge({}, { orientation: 'VIEUX' })).toThrow(/invalide/)
    expect(
      merge({ comorbidites: ['VIEUX'] }, { comorbidites: ['VIEUX', 'HTA'] }),
    ).toEqual({
      comorbidites: ['VIEUX', 'HTA'],
    })
    expect(() =>
      merge({ comorbidites: ['HTA'] }, { comorbidites: ['VIEUX'] }),
    ).toThrow(/invalide/)
  })

  it('refuse une cle inconnue, un champ archive, et un champ range dans la mauvaise colonne', () => {
    expect(() => merge({}, { inconnu: 'x' })).toThrow(/inconnu/)
    expect(() => merge({}, { ancien: 'x' })).toThrow(/archivé/)
    expect(() => merge({}, { diag: 'AVC' })).toThrow(/clinique/)
    expect(() => merge({}, { nom: 'x' }, true)).toThrow(/clinique/)
    expect(merge({}, { diag: 'AVC' }, true)).toEqual({ diag: 'AVC' })
  })

  it('ne modifie pas les objets recus', () => {
    const current = { nom: 'A' }
    merge(current, { nom: 'B' })
    expect(current).toEqual({ nom: 'A' })
  })
})

describe('generation de cles', () => {
  it('derive une cle camelCase sans accents, suffixee en cas de collision', () => {
    expect(fieldKeyFromLabel('HbA1c', new Set())).toBe('hba1c')
    expect(fieldKeyFromLabel('Suivi tabac', new Set())).toBe('suiviTabac')
    expect(fieldKeyFromLabel('Comorbidités', new Set())).toBe('comorbidites')
    expect(fieldKeyFromLabel('Comorbidités', new Set(['comorbidites']))).toBe(
      'comorbidites2',
    )
    expect(fieldKeyFromLabel('12 mois', new Set())).toBe('champ12Mois')
    expect(fieldKeyFromLabel('!!!', new Set())).toBe('champ')
  })

  it('derive une cle de choix en majuscules soulignees', () => {
    expect(choiceKeyFromLabel('Diabète type 2', new Set())).toBe(
      'DIABETE_TYPE_2',
    )
    expect(choiceKeyFromLabel('HTA', new Set(['HTA']))).toBe('HTA_2')
    expect(choiceKeyFromLabel('—', new Set())).toBe('CHOIX')
  })
})

describe('readChoice', () => {
  it('lit une valeur texte et rend null pour tout le reste', () => {
    expect(readChoice({ a: 'x' }, 'a')).toBe('x')
    expect(readChoice({ a: 1 }, 'a')).toBeNull()
    expect(readChoice({}, 'a')).toBeNull()
    expect(readChoice(null, 'a')).toBeNull()
    expect(readChoice([], 'a')).toBeNull()
  })
})

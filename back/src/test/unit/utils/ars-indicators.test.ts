import {
  ARS_THEMATIC_ROLES,
  type ArsCohort,
  type ArsFile,
  type ArsPresence,
  computeArsIndicators,
} from '../../../main/utils/ars-indicators'

const PERIODE = {
  from: new Date('2026-01-01'),
  to: new Date('2026-12-31'),
}

const presence = (p: Partial<ArsPresence> = {}): ArsPresence => ({
  date: new Date('2026-03-01'),
  type: 'ambulatory',
  individual: true,
  slotId: 'slot-1',
  thematicName: 'Mes médicaments',
  honored: true,
  accompanied: false,
  ...p,
})

const dossier = (f: Partial<ArsFile> = {}): ArsFile => ({
  patientId: 'p1',
  entryDate: new Date('2026-02-01'),
  orientation: null,
  presences: [],
  ...f,
})

const cohorte = (files: ArsFile[]): ArsCohort => ({ ...PERIODE, files })

const valeur = (cohort: ArsCohort, code: string): number | null => {
  const found = computeArsIndicators(cohort).find((i) => i.code === code)
  if (!found) {
    throw new Error(`indicateur ${code} absent de la table`)
  }
  return found.value
}

describe('rôles de thématiques', () => {
  it('reconnaît les quatre libellés de diagnostic éducatif, majuscule accentuée comprise', () => {
    expect(ARS_THEMATIC_ROLES.diagnosticEducatif).toContain(
      'Diagnostic Éducatif – HDJ SMR',
    )
    expect(ARS_THEMATIC_ROLES.diagnosticEducatif).toContain(
      'Diagnostic éducatif',
    )
  })

  it('ne reconnaît pas une thématique inconnue', () => {
    expect(ARS_THEMATIC_ROLES.reactualisation).not.toContain('Réactu 5')
    expect(ARS_THEMATIC_ROLES.reactualisation).toEqual([
      'Réactu 1',
      'Réactu 2',
      'Réactu 3',
      'Réactu 4',
    ])
  })
})

describe('groupe 1 — entrée', () => {
  it('1.1 compte les dossiers dont la date d entree tombe dans la periode', () => {
    const c = cohorte([
      dossier({ entryDate: new Date('2026-02-01') }),
      dossier({ patientId: 'p2', entryDate: new Date('2025-02-01') }),
    ])
    expect(valeur(c, '1.1')).toBe(1)
  })

  it('1.1 retient un dossier sans date d entree mais avec un rendez-vous de diagnostic educatif honore', () => {
    const c = cohorte([
      dossier({
        entryDate: null,
        presences: [
          presence({
            thematicName: 'Diagnostic Éducatif – Ambulatoire',
            date: new Date('2026-04-02'),
          }),
        ],
      }),
    ])
    expect(valeur(c, '1.1')).toBe(1)
  })

  // Review Focus 2 : ni NaN, ni exception, le dossier est simplement hors cohorte.
  it('1.1 ignore un dossier sans date d entree et sans rendez-vous de diagnostic educatif', () => {
    const c = cohorte([
      dossier({ entryDate: null, presences: [presence()] }),
    ])
    expect(valeur(c, '1.1')).toBe(0)
  })

  // Review Focus 4 : un rendez-vous sans thematique ne leve pas et ne porte aucun role.
  it('1.1 traite un rendez-vous sans thematique sans lever', () => {
    const c = cohorte([
      dossier({ entryDate: null, presences: [presence({ thematicName: null })] }),
    ])
    expect(() => valeur(c, '1.1')).not.toThrow()
    expect(valeur(c, '1.1')).toBe(0)
  })

  it('1.1bis compte ceux dont le diagnostic educatif a eu lieu par telephone', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({
            thematicName: 'Diagnostic éducatif',
            type: 'telephonic',
            date: new Date('2026-02-01'),
          }),
        ],
      }),
      dossier({ patientId: 'p2' }),
    ])
    expect(valeur(c, '1.1bis')).toBe(1)
  })

  it('1.2, 1.3 et 1.4 ventilent par orientation', () => {
    const c = cohorte([
      dossier({ orientation: 'Orientation pro santé ext hôpital' }),
      dossier({
        patientId: 'p2',
        orientation: 'Orientation pro santé au cours hospit',
      }),
      dossier({ patientId: 'p3', orientation: 'Orientation pro santé en Cs' }),
      dossier({ patientId: 'p4', orientation: 'Venue spontanée' }),
    ])
    expect(valeur(c, '1.2')).toBe(1)
    expect(valeur(c, '1.3')).toBe(1)
    expect(valeur(c, '1.4')).toBe(1)
  })
})

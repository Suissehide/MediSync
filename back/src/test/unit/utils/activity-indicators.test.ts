import {
  computeActivity,
  SEUIL_ABSENCES,
} from '../../../main/utils/activity-indicators'
import type {
  ArsCohort,
  ArsFile,
  ArsPresence,
} from '../../../main/utils/ars-indicators'

const PERIODE = { from: new Date('2026-01-01'), to: new Date('2026-12-31') }

// 2026-03-02 est un lundi.
const presence = (p: Partial<ArsPresence> = {}): ArsPresence => ({
  patientId: 'p1',
  date: new Date('2026-03-02T09:00:00Z'),
  type: 'ambulatory',
  individual: true,
  slotId: 'slot-1',
  thematicName: 'Mes médicaments',
  honored: p.status === undefined || p.status === 'yes',
  accompanied: false,
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  slotMinutes: 60,
  soignants: [],
  ...p,
})

const dossier = (f: Partial<ArsFile> = {}): ArsFile => ({
  patientId: 'p1',
  entryDate: new Date('2026-02-01'),
  exitDate: null,
  stopReason: null,
  orientation: null,
  presences: [],
  ...f,
})

const cohorte = (files: ArsFile[], extra: ArsPresence[] = []): ArsCohort => ({
  ...PERIODE,
  files,
  presences: [...files.flatMap((f) => f.presences), ...extra],
})

describe('patients', () => {
  it('compte la file active en patients distincts presents, dossier ou non', () => {
    const r = computeActivity(
      cohorte(
        [dossier({ presences: [presence(), presence({ slotId: 's2' })] })],
        [
          presence({ patientId: 'sans-dossier' }),
          presence({ patientId: 'absent', status: 'no' }),
        ],
      ),
    )
    expect(r.patients.active).toBe(2)
  })

  it('ignore les presences hors periode pour la file active', () => {
    const r = computeActivity(
      cohorte([], [presence({ date: new Date('2025-12-31T09:00:00Z') })]),
    )
    expect(r.patients.active).toBe(0)
  })

  it('compte une presence du dernier jour de la periode', () => {
    const r = computeActivity(
      cohorte([], [presence({ date: new Date('2026-12-31T15:00:00Z') })]),
    )
    expect(r.patients.active).toBe(1)
  })

  it('compte les nouveaux inclus par la date de diagnostic educatif', () => {
    const r = computeActivity(
      cohorte([
        dossier({ patientId: 'a', entryDate: new Date('2026-04-01') }),
        dossier({ patientId: 'b', entryDate: new Date('2025-04-01') }),
      ]),
    )
    expect(r.patients.newlyIncluded).toBe(1)
  })

  it('compte les sortis par la date de sortie', () => {
    const r = computeActivity(
      cohorte([
        dossier({ patientId: 'a', exitDate: new Date('2026-06-01') }),
        dossier({ patientId: 'b', exitDate: new Date('2027-01-02') }),
        dossier({ patientId: 'c' }),
      ]),
    )
    expect(r.patients.exited).toBe(1)
  })
})

describe('completion', () => {
  const complet = (patientId: string) => [
    presence({ patientId, date: new Date('2025-10-01T09:00:00Z') }),
    presence({
      patientId,
      date: new Date('2026-02-01T09:00:00Z'),
      thematicName: 'Réactu 1',
    }),
  ]

  // Review Focus 1 : inclus l'an dernier, sorti cette annee, programme complet.
  it('compte comme termine un programme commence avant la periode', () => {
    const r = computeActivity(
      cohorte([
        dossier({
          entryDate: new Date('2025-09-15'),
          exitDate: new Date('2026-03-01'),
          stopReason: 'PLUS_BESOIN_FIN_PARCOURS',
          presences: complet('p1'),
        }),
      ]),
    )
    expect(r.completion.completed).toBe(1)
    expect(r.completion.rate).toBe(1)
  })

  it('compte les abandons par motif, hors fin de parcours', () => {
    const r = computeActivity(
      cohorte([
        dossier({
          patientId: 'a',
          exitDate: new Date('2026-05-01'),
          stopReason: 'PERDU_DE_VUE',
        }),
        dossier({
          patientId: 'b',
          exitDate: new Date('2026-05-01'),
          stopReason: 'PERDU_DE_VUE',
        }),
        dossier({
          patientId: 'c',
          exitDate: new Date('2026-05-01'),
          stopReason: 'DECES',
        }),
        dossier({
          patientId: 'd',
          exitDate: new Date('2026-05-01'),
          stopReason: 'PLUS_BESOIN_FIN_PARCOURS',
        }),
        dossier({ patientId: 'e', exitDate: new Date('2026-05-01') }),
      ]),
    )
    expect(r.completion.dropouts).toBe(3)
    expect(r.completion.dropoutReasons).toEqual([
      { reason: 'PERDU_DE_VUE', count: 2 },
      { reason: 'DECES', count: 1 },
    ])
  })

  it('ne compte pas un motif d arret vide comme un abandon', () => {
    const r = computeActivity(
      cohorte([dossier({ exitDate: new Date('2026-05-01'), stopReason: '' })]),
    )
    expect(r.completion.dropouts).toBe(0)
  })

  // Review Focus 2.
  it('rend un taux nul plutot qu une division par zero sans sortie', () => {
    const r = computeActivity(cohorte([dossier()]))
    expect(r.completion.exited).toBe(0)
    expect(r.completion.rate).toBeNull()
  })
})

describe('absences', () => {
  const pointes = (n: number, p: Partial<ArsPresence>) =>
    Array.from({ length: n }, (_, i) => presence({ slotId: `x${i}`, ...p }))

  it('exclut les non pointes du taux', () => {
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({ status: 'yes' }),
          presence({ status: 'no' }),
          presence({ status: null }),
        ],
      ),
    )
    expect(r.absences.overall).toEqual({ absent: 1, pointed: 2, rate: 0.5 })
  })

  it('ventile par thematique et par jour de semaine', () => {
    const mardi = new Date('2026-03-03T09:00:00Z')
    const r = computeActivity(
      cohorte(
        [],
        [
          ...pointes(4, {
            thematicName: 'Coaching',
            date: mardi,
            status: 'no',
          }),
          ...pointes(1, {
            thematicName: 'Coaching',
            date: mardi,
            status: 'yes',
          }),
        ],
      ),
    )
    const coaching = r.absences.byThematic.find(
      (t) => t.thematic === 'Coaching',
    )
    expect(coaching?.cells[1]).toEqual({ absent: 4, pointed: 5, rate: 0.8 })
    expect(coaching?.cells[0]).toEqual({ absent: 0, pointed: 0, rate: null })
    expect(r.absences.weekdays).toEqual([1])
    expect(r.absences.worst).toEqual({ thematic: 'Coaching', weekday: 1 })
  })

  // Review Focus 4.
  it('ne designe pas un pire endroit sous le seuil', () => {
    const r = computeActivity(
      cohorte(
        [],
        pointes(SEUIL_ABSENCES - 1, { thematicName: 'Rare', status: 'no' }),
      ),
    )
    expect(r.absences.byThematic[0]?.cells[0]?.rate).toBeNull()
    expect(r.absences.worst).toBeNull()
  })

  it('range une presence sans parcours dans Hors parcours', () => {
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({ status: 'no' }),
          presence({
            status: 'no',
            pathwayId: 'pw',
            pathwayLabel: 'Réadaptation — 05/10/2026',
          }),
        ],
      ),
    )
    expect(r.absences.byPathway.map((p) => p.pathway).sort()).toEqual([
      'Hors parcours',
      'Réadaptation — 05/10/2026',
    ])
  })

  it('distingue deux parcours de meme libelle par leur identifiant', () => {
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({
            status: 'no',
            pathwayId: 'pw1',
            pathwayLabel: 'Réadaptation — 05/10/2026',
          }),
          presence({
            status: 'no',
            pathwayId: 'pw2',
            pathwayLabel: 'Réadaptation — 05/10/2026',
          }),
        ],
      ),
    )
    expect(r.absences.byPathway).toHaveLength(2)
  })

  it('ne designe pas de pire case quand personne n est absent', () => {
    const r = computeActivity(
      cohorte([], pointes(SEUIL_ABSENCES, { status: 'yes' })),
    )
    expect(r.absences.worst).toBeNull()
  })
})

describe('seances et temps soignant', () => {
  it('compte les seances individuelles et les creneaux collectifs distincts', () => {
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({ slotId: 'i1' }),
          presence({ slotId: 'i2', status: 'no' }),
          presence({ slotId: 'c1', individual: false, patientId: 'a' }),
          presence({ slotId: 'c1', individual: false, patientId: 'b' }),
        ],
      ),
    )
    expect(r.sessions.individual).toBe(1)
    expect(r.sessions.collective).toBe(1)
  })

  it('compte les diagnostics educatifs et les bilans de fin realises', () => {
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({ thematicName: 'Diagnostic éducatif' }),
          presence({ thematicName: 'Réactu 2' }),
          presence({ thematicName: 'Réactu 3', status: 'no' }),
        ],
      ),
    )
    expect(r.sessions.educationalDiagnoses).toBe(1)
    expect(r.sessions.finalReviews).toBe(1)
  })

  // Review Focus 3 : trois presents, deux soignants -> 2 x 90 min, pas 6.
  it('compte la duree d un creneau une fois par soignant', () => {
    const collectif = {
      slotId: 'c1',
      individual: false,
      slotMinutes: 90,
      soignants: ['IDE', 'Diététicienne'],
    }
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({ ...collectif, patientId: 'a' }),
          presence({ ...collectif, patientId: 'b' }),
          presence({ ...collectif, patientId: 'c' }),
        ],
      ),
    )
    expect(r.hoursBySoignant).toEqual([
      { soignant: 'Diététicienne', hours: 1.5 },
      { soignant: 'IDE', hours: 1.5 },
    ])
  })

  it('ne compte pas le temps d un creneau sans present', () => {
    const r = computeActivity(
      cohorte([], [presence({ status: 'no', soignants: ['IDE'] })]),
    )
    expect(r.hoursBySoignant).toEqual([])
  })
})

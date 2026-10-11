import {
  computeActivity,
  filterByPathwayTemplate,
  SEUIL_ABSENCES,
} from '../../../main/utils/activity-indicators'
import type {
  CohortFile,
  CohortPresence,
  IndicatorCohort,
} from '../../../main/utils/indicators/cohort'

const PERIODE = { from: new Date('2026-01-01'), to: new Date('2026-12-31') }

const SETTINGS = {
  stopReasonField: 'stopReason',
  completedChoice: 'PLUS_BESOIN_FIN_PARCOURS',
  labels: { PERDU_DE_VUE: 'Perdu de vue', DECES: 'Décès' },
}

// 2026-03-02 est un lundi.
const presence = (p: Partial<CohortPresence> = {}): CohortPresence => ({
  patientId: 'p1',
  date: new Date('2026-03-02T09:00:00Z'),
  type: 'ambulatory',
  individual: true,
  slotId: 'slot-1',
  thematicName: 'Mes médicaments',
  thematicRole: null,
  honored: p.status === undefined || p.status === 'yes',
  accompanied: false,
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  pathwayTemplateId: null,
  slotMinutes: 60,
  soignants: [],
  ...p,
})

const dossier = ({
  stopReason,
  ...f
}: Partial<Omit<CohortFile, 'values'>> & {
  stopReason?: string
} = {}): CohortFile => ({
  patientId: 'p1',
  entryDate: new Date('2026-02-01'),
  exitDate: null,
  values: stopReason === undefined ? {} : { stopReason },
  presences: [],
  ...f,
})

const cohorte = (
  files: CohortFile[],
  extra: CohortPresence[] = [],
): IndicatorCohort => ({
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
      null,
    )
    expect(r.patients.active).toBe(2)
  })

  it('ignore les presences hors periode pour la file active', () => {
    const r = computeActivity(
      cohorte([], [presence({ date: new Date('2025-12-31T09:00:00Z') })]),
      null,
    )
    expect(r.patients.active).toBe(0)
  })

  it('compte une presence du dernier jour de la periode', () => {
    const r = computeActivity(
      cohorte([], [presence({ date: new Date('2026-12-31T15:00:00Z') })]),
      null,
    )
    expect(r.patients.active).toBe(1)
  })

  it('compte les nouveaux inclus par la date de diagnostic educatif', () => {
    const r = computeActivity(
      cohorte([
        dossier({ patientId: 'a', entryDate: new Date('2026-04-01') }),
        dossier({ patientId: 'b', entryDate: new Date('2025-04-01') }),
      ]),
      null,
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
      null,
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
      thematicRole: 'REACTUALISATION',
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
      SETTINGS,
    )
    expect(r.completion?.completed).toBe(1)
    expect(r.completion?.rate).toBe(1)
  })

  it('reconnait un programme complet par le role, peu importe le nom de la thematique', () => {
    const r = computeActivity(
      cohorte([
        dossier({
          entryDate: new Date('2025-09-15'),
          exitDate: new Date('2026-03-01'),
          stopReason: 'PLUS_BESOIN_FIN_PARCOURS',
          presences: [
            presence({ date: new Date('2025-10-01T09:00:00Z') }),
            presence({
              date: new Date('2026-02-01T09:00:00Z'),
              thematicName: 'SMCP Réactu 1',
              thematicRole: 'REACTUALISATION',
            }),
          ],
        }),
      ]),
      SETTINGS,
    )
    expect(r.completion?.completed).toBe(1)
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
      SETTINGS,
    )
    expect(r.completion?.dropouts).toBe(3)
    expect(r.completion?.dropoutReasons).toEqual([
      { reason: 'PERDU_DE_VUE', label: 'Perdu de vue', count: 2 },
      { reason: 'DECES', label: 'Décès', count: 1 },
    ])
  })

  it('ne compte pas un motif d arret vide comme un abandon', () => {
    const r = computeActivity(
      cohorte([dossier({ exitDate: new Date('2026-05-01'), stopReason: '' })]),
      SETTINGS,
    )
    expect(r.completion?.dropouts).toBe(0)
  })

  // Review Focus 2.
  it('rend un taux nul plutot qu une division par zero sans sortie', () => {
    const r = computeActivity(cohorte([dossier()]), SETTINGS)
    expect(r.completion?.exited).toBe(0)
    expect(r.completion?.rate).toBeNull()
  })

  // Review Focus 3.
  it('rend une completion nulle sans reglage du service', () => {
    const r = computeActivity(
      cohorte([
        dossier({
          exitDate: new Date('2026-05-01'),
          stopReason: 'PERDU_DE_VUE',
        }),
      ]),
      null,
    )
    expect(r.completion).toBeNull()
  })

  it('lit le champ et la valeur de fin designes par les reglages, pas stopReason', () => {
    const fichier = (patientId: string, motifSortie: string): CohortFile => ({
      patientId,
      entryDate: new Date('2026-02-01'),
      exitDate: new Date('2026-05-01'),
      values: { motifSortie },
      presences: [],
    })
    const r = computeActivity(
      cohorte([
        fichier('a', 'ABANDON'),
        fichier('b', 'TERMINE'),
        // Un ancien stopReason ne doit plus etre lu : la cle reglee est motifSortie.
        dossier({
          patientId: 'c',
          exitDate: new Date('2026-05-01'),
          stopReason: 'PERDU_DE_VUE',
        }),
      ]),
      {
        stopReasonField: 'motifSortie',
        completedChoice: 'TERMINE',
        labels: { ABANDON: 'Abandon' },
      },
    )
    expect(r.completion?.dropouts).toBe(1)
    expect(r.completion?.dropoutReasons).toEqual([
      { reason: 'ABANDON', label: 'Abandon', count: 1 },
    ])
  })
})

describe('absences', () => {
  const pointes = (n: number, p: Partial<CohortPresence>) =>
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
      null,
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
      null,
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
      null,
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
      null,
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
      null,
    )
    expect(r.absences.byPathway).toHaveLength(2)
  })

  it('ne designe pas de pire case quand personne n est absent', () => {
    const r = computeActivity(
      cohorte([], pointes(SEUIL_ABSENCES, { status: 'yes' })),
      null,
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
      null,
    )
    expect(r.sessions.individual).toBe(1)
    expect(r.sessions.collective).toBe(1)
  })

  it('compte les diagnostics educatifs et les bilans de fin realises', () => {
    const r = computeActivity(
      cohorte(
        [],
        [
          presence({
            thematicName: 'Diagnostic éducatif',
            thematicRole: 'DIAGNOSTIC_EDUCATIF',
          }),
          presence({ thematicName: 'Bilan', thematicRole: 'BILAN_DE_FIN' }),
          presence({
            thematicName: 'Réactu 1',
            thematicRole: 'REACTUALISATION',
          }),
          presence({
            thematicName: 'Bilan',
            thematicRole: 'BILAN_DE_FIN',
            status: 'no',
          }),
        ],
      ),
      null,
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
      null,
    )
    expect(r.hoursBySoignant).toEqual([
      { soignant: 'Diététicienne', hours: 1.5 },
      { soignant: 'IDE', hours: 1.5 },
    ])
  })

  it('ne compte pas le temps d un creneau sans present', () => {
    const r = computeActivity(
      cohorte([], [presence({ status: 'no', soignants: ['IDE'] })]),
      null,
    )
    expect(r.hoursBySoignant).toEqual([])
  })
})

describe('monthly', () => {
  const TRIMESTRE = { from: new Date('2026-10-01'), to: new Date('2026-12-31') }

  it('rend un element par mois de la periode', () => {
    const r = computeActivity({ ...TRIMESTRE, files: [], presences: [] }, null)
    expect(r.monthly.map((m) => m.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ])
  })

  it('range inclus et sortis une seule fois, sommes egales aux totaux', () => {
    const de1 = presence({
      patientId: 'a',
      date: new Date('2026-10-05T09:00:00Z'),
      thematicRole: 'DIAGNOSTIC_EDUCATIF',
    })
    const de2 = presence({
      patientId: 'a',
      date: new Date('2026-11-05T09:00:00Z'),
      thematicRole: 'DIAGNOSTIC_EDUCATIF',
    })
    const r = computeActivity(
      {
        ...TRIMESTRE,
        files: [
          dossier({ patientId: 'a', entryDate: null, presences: [de1, de2] }),
          dossier({
            patientId: 'b',
            entryDate: new Date('2026-11-10'),
            exitDate: new Date('2026-12-02'),
          }),
        ],
        presences: [de1, de2],
      },
      null,
    )
    expect(r.monthly).toEqual([
      { month: '2026-10', newlyIncluded: 1, exited: 0, active: 1 },
      { month: '2026-11', newlyIncluded: 1, exited: 0, active: 1 },
      { month: '2026-12', newlyIncluded: 0, exited: 1, active: 0 },
    ])
    expect(r.monthly.reduce((s, m) => s + m.newlyIncluded, 0)).toBe(
      r.patients.newlyIncluded,
    )
    expect(r.monthly.reduce((s, m) => s + m.exited, 0)).toBe(r.patients.exited)
  })
})

describe('byWeekday', () => {
  it('agrege toutes thematiques par jour avec le seuil', () => {
    const lundi = new Date('2026-03-02T09:00:00Z')
    const ps = [
      ...Array.from({ length: 3 }, (_, i) =>
        presence({
          slotId: `a${i}`,
          thematicName: 'A',
          date: lundi,
          status: 'no',
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        presence({
          slotId: `b${i}`,
          thematicName: 'B',
          date: lundi,
          status: 'yes',
        }),
      ),
      presence({
        thematicName: 'C',
        date: new Date('2026-03-03T09:00:00Z'),
        status: 'no',
      }),
    ]
    const r = computeActivity(cohorte([], ps), null)
    expect(r.absences.byWeekday).toHaveLength(7)
    expect(r.absences.byWeekday[0]).toEqual({
      absent: 3,
      pointed: 5,
      rate: 0.6,
    })
    expect(r.absences.byWeekday[1]).toEqual({
      absent: 1,
      pointed: 1,
      rate: null,
    })
  })
})

describe('filterByPathwayTemplate', () => {
  it('garde les patients du modele avec toutes leurs presences et retire les autres', () => {
    const duModele = presence({
      patientId: 'a',
      slotId: 's1',
      pathwayTemplateId: 'T1',
    })
    const horsParcours = presence({
      patientId: 'a',
      slotId: 's2',
      pathwayTemplateId: null,
    })
    const autre = presence({
      patientId: 'b',
      slotId: 's3',
      pathwayTemplateId: 'T2',
    })
    const c = cohorte([
      dossier({ patientId: 'a', presences: [duModele, horsParcours] }),
      dossier({ patientId: 'b', presences: [autre] }),
    ])
    const f = filterByPathwayTemplate(c, 'T1')
    expect(f.files.map((x) => x.patientId)).toEqual(['a'])
    expect(f.presences).toEqual([duModele, horsParcours])
  })

  it('rend une cohorte vide pour un modele inconnu', () => {
    const c = cohorte([dossier({ presences: [presence()] })])
    const f = filterByPathwayTemplate(c, 'inconnu')
    expect(f.files).toEqual([])
    expect(f.presences).toEqual([])
  })
})

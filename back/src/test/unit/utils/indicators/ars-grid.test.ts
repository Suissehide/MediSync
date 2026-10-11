import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ETP_FIELD_PRESET } from '../../../../main/utils/etp-field-preset'
import { ARS_PRESET } from '../../../../main/utils/indicators/ars-preset'
import {
  ACCOMPANYING_YES,
  type CohortFile,
  type CohortPresence,
  type IndicatorCohort,
} from '../../../../main/utils/indicators/cohort'
import {
  computeIndicator,
  type FieldDefinition,
} from '../../../../main/utils/indicators/compute'

// L'ancienne grille codée, rejouée par le moteur sur le jeu ARS_PRESET : mêmes attentes.
const PERIODE = {
  from: new Date('2026-01-01'),
  to: new Date('2026-12-31'),
}

const presence = (p: Partial<CohortPresence> = {}): CohortPresence => ({
  patientId: 'p1',
  date: new Date('2026-03-01'),
  type: 'ambulatory',
  individual: true,
  slotId: 'slot-1',
  thematicName: 'Mes médicaments',
  thematicRole: null,
  honored: true,
  accompanied: false,
  pathwayId: null,
  pathwayLabel: null,
  pathwayTemplateId: null,
  slotMinutes: 60,
  soignants: [],
  ...p,
  status:
    p.status !== undefined ? p.status : p.honored === false ? 'no' : 'yes',
})

const dossier = ({
  orientation,
  ...f
}: Partial<Omit<CohortFile, 'values'>> & {
  orientation?: string
} = {}): CohortFile => ({
  patientId: 'p1',
  entryDate: new Date('2026-02-01'),
  exitDate: null,
  values: orientation ? { orientation } : {},
  presences: [],
  ...f,
})

const cohorte = (files: CohortFile[]): IndicatorCohort => ({
  ...PERIODE,
  files,
  presences: files.flatMap((f) => f.presences),
})

const FIELDS: FieldDefinition[] = ETP_FIELD_PRESET.map((f) => ({
  key: f.key,
  label: f.label,
  type: f.type,
  archivedAt: null,
  choices: f.choices.map((c, order) => ({
    key: c.key,
    label: c.label,
    order,
    archivedAt: null,
  })),
}))

const grille = (cohort: IndicatorCohort) =>
  ARS_PRESET.map((i) => ({
    code: i.code,
    group: i.group,
    label: i.label,
    note: i.note ?? null,
    nature: i.nature,
    input: i.input ?? null,
    value: computeIndicator(
      cohort,
      {
        nature: i.nature,
        measure: i.measure ?? null,
        options: i.options ?? null,
        filters: i.filters ?? null,
        breakdownField: i.breakdownField ?? null,
        input: i.input ?? null,
        note: i.note ?? null,
      },
      FIELDS,
    ).value,
  }))

const valeur = (cohort: IndicatorCohort, code: string): number | null => {
  const found = grille(cohort).find((i) => i.code === code)
  if (!found) {
    throw new Error(`indicateur ${code} absent de la table`)
  }
  return found.value
}

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
            thematicRole: 'DIAGNOSTIC_EDUCATIF',
            date: new Date('2026-04-02'),
          }),
        ],
      }),
    ])
    expect(valeur(c, '1.1')).toBe(1)
  })

  // Review Focus 2 : ni NaN, ni exception, le dossier est simplement hors cohorte.
  it('1.1 ignore un dossier sans date d entree et sans rendez-vous de diagnostic educatif', () => {
    const c = cohorte([dossier({ entryDate: null, presences: [presence()] })])
    expect(valeur(c, '1.1')).toBe(0)
  })

  // Review Focus 4 : un rendez-vous sans thematique ne leve pas et ne porte aucun role.
  it('1.1 traite un rendez-vous sans thematique sans lever', () => {
    const c = cohorte([
      dossier({
        entryDate: null,
        presences: [presence({ thematicName: null })],
      }),
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
            thematicRole: 'DIAGNOSTIC_EDUCATIF',
            type: 'telephonic',
            date: new Date('2026-02-01'),
          }),
        ],
      }),
      dossier({ patientId: 'p2' }),
    ])
    expect(valeur(c, '1.1bis')).toBe(1)
  })
})

describe('groupe 2 — séances et mode de prise en charge', () => {
  it('2.1 compte les patients pris en charge uniquement en hospitalisation', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ type: 'hospital' }),
          presence({ type: 'hospital', date: new Date('2026-05-01') }),
        ],
      }),
      dossier({
        patientId: 'p2',
        presences: [
          presence({ type: 'hospital' }),
          presence({ type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.1')).toBe(1)
  })

  it('2.2 compte les patients pris en charge uniquement en soins externes, distanciel compris', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ type: 'ambulatory' }),
          presence({ type: 'telephonic' }),
        ],
      }),
    ])
    expect(valeur(c, '2.2')).toBe(1)
  })

  it('2.4 compte le parcours mixte, ni 2.1 ni 2.2', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ type: 'hospital' }),
          presence({ type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.1')).toBe(0)
    expect(valeur(c, '2.2')).toBe(0)
    expect(valeur(c, '2.4')).toBe(1)
  })

  it('2.6 compte les seances individuelles honorees de la periode', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: true }),
          presence({ individual: true, honored: false }),
          presence({ individual: false }),
          presence({ individual: true, date: new Date('2025-03-01') }),
        ],
      }),
    ])
    expect(valeur(c, '2.6')).toBe(1)
  })

  it('2.6bis compte celles qui ont eu lieu par telephone', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: true, type: 'telephonic' }),
          presence({ individual: true, type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.6bis')).toBe(1)
  })

  it('2.7 compte les creneaux collectifs distincts, pas les presences', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'b' }),
        ],
      }),
    ])
    expect(valeur(c, '2.7')).toBe(2)
  })

  // Draxa rendait 0 en dur ici : la correction est l'objet de ce cas.
  it('2.7bis compte les creneaux collectifs entierement en distanciel', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: false, slotId: 'a', type: 'telephonic' }),
          presence({ individual: false, slotId: 'b', type: 'telephonic' }),
          presence({ individual: false, slotId: 'b', type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.7bis')).toBe(1)
  })

  it('2.8 rend la moyenne de patients par seance collective, a une decimale', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'b' }),
        ],
      }),
    ])
    expect(valeur(c, '2.8')).toBe(1.5)
  })

  // Review Focus 1 : aucune division par zero quand la periode est vide.
  it('2.8 vaut 0 sans aucune seance collective', () => {
    expect(valeur(cohorte([]), '2.8')).toBe(0)
  })

  // Review Focus 1 : une periode sans dossier rend 0 partout, jamais NaN ni null.
  it('rend 0 pour tous les indicateurs calcules sur une periode vide', () => {
    for (const r of grille(cohorte([]))) {
      if (r.note === null) {
        expect(r.value).toBe(0)
      }
    }
  })

  // Draxa recopiait 2.10 ici : la correction est l'objet de ce cas.
  it('2.9 compte des patients distincts, la ou 2.10 compte des seances', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ accompanied: true }),
          presence({ accompanied: true, date: new Date('2026-04-01') }),
        ],
      }),
    ])
    expect(valeur(c, '2.9')).toBe(1)
    expect(valeur(c, '2.10')).toBe(2)
  })
})

const reactu = (p: Partial<CohortPresence> = {}) =>
  presence({
    thematicName: 'Réactu 1',
    thematicRole: 'REACTUALISATION',
    ...p,
  })

describe('groupe 3 — sortie', () => {
  it('3.1 exige une seance et une reactualisation apres le diagnostic educatif', () => {
    const complet = dossier({
      presences: [
        presence({ date: new Date('2026-03-01') }),
        reactu({ date: new Date('2026-06-01') }),
      ],
    })
    const sansReactu = dossier({
      patientId: 'p2',
      presences: [presence({ date: new Date('2026-03-01') })],
    })
    expect(valeur(cohorte([complet, sansReactu]), '3.1')).toBe(1)
  })

  it('3.2 et 3.3 restreignent au type de prise en charge', () => {
    const hospit = dossier({
      presences: [
        presence({ type: 'hospital', date: new Date('2026-03-01') }),
        reactu({ type: 'hospital', date: new Date('2026-06-01') }),
      ],
    })
    const ambu = dossier({
      patientId: 'p2',
      presences: [
        presence({ type: 'ambulatory', date: new Date('2026-03-01') }),
        reactu({ type: 'ambulatory', date: new Date('2026-06-01') }),
      ],
    })
    const c = cohorte([hospit, ambu])
    expect(valeur(c, '3.2')).toBe(1)
    expect(valeur(c, '3.3')).toBe(1)
  })

  // Draxa recopiait 3.1 ici : la correction est l'objet de ce cas.
  // La cohorte porte DEUX dossiers, et c'est ce qui rend le cas falsifiable : avec un seul
  // dossier mixte, `3.1` et `3.4` valent tous deux 1 et le bug de Draxa (`3.4` renvoyait `3.1`)
  // passerait le test. Ici `3.1 = 2` et `3.4 = 1` : la copie rougirait.
  it('3.4 compte le parcours mixte, pas le total de 3.1', () => {
    const mixte = dossier({
      presences: [
        presence({ type: 'hospital', date: new Date('2026-03-01') }),
        reactu({ type: 'ambulatory', date: new Date('2026-06-01') }),
      ],
    })
    const hospitSeul = dossier({
      patientId: 'p2',
      presences: [
        presence({ type: 'hospital', date: new Date('2026-03-01') }),
        reactu({ type: 'hospital', date: new Date('2026-06-01') }),
      ],
    })
    const c = cohorte([mixte, hospitSeul])
    expect(valeur(c, '3.1')).toBe(2)
    expect(valeur(c, '3.2')).toBe(1)
    expect(valeur(c, '3.3')).toBe(0)
    expect(valeur(c, '3.4')).toBe(1)
  })

  it('3.6 compte les patients ayant eu une reactualisation dans la periode', () => {
    const c = cohorte([dossier({ presences: [reactu()] })])
    expect(valeur(c, '3.6')).toBe(1)
  })
})

describe('groupe 4 — modalités', () => {
  it('4.1 exige au moins trois seances honorees depuis le diagnostic educatif', () => {
    const trois = dossier({
      presences: [
        presence({ date: new Date('2026-03-01') }),
        presence({ date: new Date('2026-04-01') }),
        presence({ date: new Date('2026-05-01') }),
      ],
    })
    const deux = dossier({
      patientId: 'p2',
      presences: [
        presence({ date: new Date('2026-03-01') }),
        presence({ date: new Date('2026-04-01') }),
      ],
    })
    expect(valeur(cohorte([trois, deux]), '4.1')).toBe(1)
  })

  it('4.1bis exige trois seances avant la derniere reactualisation', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ date: new Date('2026-03-01') }),
          presence({ date: new Date('2026-04-01') }),
          presence({ date: new Date('2026-05-01') }),
          reactu({ date: new Date('2026-06-01') }),
        ],
      }),
    ])
    expect(valeur(c, '4.1bis')).toBe(1)
  })

  it('4.3 exige trois seances apres la premiere reactualisation', () => {
    const c = cohorte([
      dossier({
        presences: [
          reactu({ date: new Date('2026-02-01') }),
          presence({ date: new Date('2026-03-01') }),
          presence({ date: new Date('2026-04-01') }),
          presence({ date: new Date('2026-05-01') }),
        ],
      }),
    ])
    expect(valeur(c, '4.3')).toBe(1)
  })

  it('4.3bis exige trois seances entre deux reactualisations', () => {
    const c = cohorte([
      dossier({
        presences: [
          reactu({ date: new Date('2026-02-01') }),
          presence({ date: new Date('2026-03-01') }),
          presence({ date: new Date('2026-04-01') }),
          presence({ date: new Date('2026-05-01') }),
          reactu({ thematicName: 'Réactu 2', date: new Date('2026-06-01') }),
        ],
      }),
    ])
    expect(valeur(c, '4.3bis')).toBe(1)
  })
})

describe('table complète', () => {
  it('rend une valeur nulle et une raison pour 2.3, 2.11, 3.5 et 4.4', () => {
    const resultats = grille(cohorte([]))
    for (const code of ['2.3', '2.11', '3.5', '4.4']) {
      const i = resultats.find((r) => r.code === code)
      expect(i?.value).toBeNull()
      expect(i?.note).toEqual(expect.any(String))
    }
  })

  it('marque 2.5 et 4.2 comme a renseigner a la main', () => {
    const resultats = grille(cohorte([]))
    for (const code of ['2.5', '4.2']) {
      const i = resultats.find((r) => r.code === code)
      expect(i?.value).toBeNull()
      expect(i?.note).toContain('renseigner')
    }
  })

  it('rend les 30 indicateurs, dans l ordre des groupes', () => {
    const resultats = grille(cohorte([]))
    expect(resultats).toHaveLength(30)
    expect(resultats.map((r) => r.group)).toEqual([
      ...Array(5).fill('Entrée'),
      ...Array(13).fill('Séances'),
      ...Array(6).fill('Sortie'),
      ...Array(6).fill('Modalités'),
    ])
  })
})

describe('nature et input de chaque indicateur', () => {
  it('nature distingue calcule, non disponible et a saisir', () => {
    const resultats = grille(cohorte([]))
    const parCode = (code: string) => resultats.find((r) => r.code === code)
    expect(parCode('1.1')?.nature).toBe('computed')
    expect(parCode('2.3')?.nature).toBe('unavailable')
    expect(parCode('2.5')?.nature).toBe('manual')
    expect(parCode('2.5')?.input).toBe('number+text')
    expect(parCode('4.2')?.nature).toBe('manual')
    expect(parCode('4.2')?.input).toBe('yesno')
  })

  it('input vaut null hors des deux indicateurs manuels', () => {
    const resultats = grille(cohorte([]))
    for (const r of resultats) {
      if (r.code !== '2.5' && r.code !== '4.2') {
        expect(r.input).toBeNull()
      }
    }
  })

  it('les saisies sont exactement 2.5 et 4.2, avec leur type', () => {
    expect(
      Object.fromEntries(
        ARS_PRESET.filter((i) => i.nature === 'manual').map((i) => [
          i.code,
          i.input,
        ]),
      ),
    ).toEqual({ '2.5': 'number+text', '4.2': 'yesno' })
  })
})

describe('regression : codes, groupes, libelles et notes inchanges', () => {
  it('rend exactement les 30 {code, group, label, note} attendus', () => {
    const resultats = grille(cohorte([])).map((r) => ({
      code: r.code,
      group: r.group,
      label: r.label,
      note: r.note,
    }))
    expect(resultats).toEqual([
      {
        code: '1.1',
        group: 'Entrée',
        label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
        note: null,
      },
      {
        code: '1.1bis',
        group: 'Entrée',
        label:
          "Dont nombre de patients ayant bénéficié d'un diagnostic éducatif en distanciel",
        note: null,
      },
      {
        code: '1.2',
        group: 'Entrée',
        label:
          "Nombre de patients orientés par un professionnel de santé en dehors d'un hôpital (dont médecin traitant)",
        note: null,
      },
      {
        code: '1.3',
        group: 'Entrée',
        label:
          "Nombre de patients orientés par un professionnel de santé au cours d'une hospitalisation",
        note: null,
      },
      {
        code: '1.4',
        group: 'Entrée',
        label:
          "Nombre de patients orientés par un professionnel de santé à l'hôpital en consultation externe",
        note: null,
      },
      {
        code: '2.1',
        group: 'Séances',
        label:
          "Nombre de patients pris en charge au cours d'une hospitalisation (de jour, de semaine, complète) en établissement de santé uniquement",
        note: null,
      },
      {
        code: '2.2',
        group: 'Séances',
        label:
          "Nombre de patients pris en charge en soins externes d'un établissement de santé uniquement",
        note: null,
      },
      {
        code: '2.3',
        group: 'Séances',
        label:
          'Nombre de patients pris en charge en soins de ville uniquement (MSP, association, ex-réseau de PS libéraux…)',
        note: 'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
      },
      {
        code: '2.4',
        group: 'Séances',
        label:
          'Nombre de patients pris en charge en programme mixte (hospitalisation + soins externes)',
        note: null,
      },
      {
        code: '2.5',
        group: 'Séances',
        label: 'Autre type de prise en charge à chiffrer et à expliquer',
        note: "Champ libre de l'enquête, à renseigner à la main",
      },
      {
        code: '2.6',
        group: 'Séances',
        label: "Nombre total de séances individuelles d'ETP réalisées",
        note: null,
      },
      {
        code: '2.6bis',
        group: 'Séances',
        label:
          "Dont nombre de séances individuelles d'ETP réalisées en distanciel",
        note: null,
      },
      {
        code: '2.7',
        group: 'Séances',
        label: "Nombre total de séances collectives d'ETP réalisées",
        note: null,
      },
      {
        code: '2.7bis',
        group: 'Séances',
        label:
          "Dont nombre de séances collectives d'ETP réalisées en distanciel",
        note: null,
      },
      {
        code: '2.8',
        group: 'Séances',
        label: 'Nombre moyen de patients par séance collective',
        note: null,
      },
      {
        code: '2.9',
        group: 'Séances',
        label:
          'Nombre de proches et/ou aidants du patient ayant participé au programme',
        note: null,
      },
      {
        code: '2.10',
        group: 'Séances',
        label:
          "Nombre total de séances d'ETP avec une participation de proches et/ou aidants du patient",
        note: null,
      },
      {
        code: '2.11',
        group: 'Séances',
        label:
          'Nombre total de séances destinées exclusivement aux proches et/ou aidants du patient',
        note: 'Un rendez-vous est toujours rattaché à des patients : une séance sans patient ne se représente pas',
      },
      {
        code: '3.1',
        group: 'Sortie',
        label:
          'Nombre de patients ayant suivi un programme personnalisé complet (quel que soit le mode de prise en charge)',
        note: null,
      },
      {
        code: '3.2',
        group: 'Sortie',
        label:
          "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une hospitalisation complète ou de jour)",
        note: null,
      },
      {
        code: '3.3',
        group: 'Sortie',
        label:
          "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une venue en soins externes)",
        note: null,
      },
      {
        code: '3.4',
        group: 'Sortie',
        label:
          'Nombre de patients ayant suivi un programme personnalisé complet (au cours d’une venue mixte)',
        note: null,
      },
      {
        code: '3.5',
        group: 'Sortie',
        label:
          "Nombre de patients ayant suivi un programme personnalisé complet (au cours de séances d'ETP pratiquées en soins de ville)",
        note: 'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
      },
      {
        code: '3.6',
        group: 'Sortie',
        label:
          "Nombre de patients ayant bénéficié d'une évaluation individuelle des compétences acquises de l'ETP",
        note: null,
      },
      {
        code: '4.1',
        group: 'Modalités',
        label:
          "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre initiale d'ETP",
        note: null,
      },
      {
        code: '4.1bis',
        group: 'Modalités',
        label:
          'Dont nombre de patients ayant terminé par une réactualisation (Réactu 1 à 4)',
        note: null,
      },
      {
        code: '4.2',
        group: 'Modalités',
        label:
          'Une offre de suivi ou de renforcement dans un nouveau programme est-elle proposée au sein de la structure ?',
        note: 'Question oui/non sur la structure, à renseigner à la main',
      },
      {
        code: '4.3',
        group: 'Modalités',
        label:
          "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre de suivi ou de renforcement d'ETP commençant par une réactualisation",
        note: null,
      },
      {
        code: '4.3bis',
        group: 'Modalités',
        label:
          'Dont nombre de patients ayant également terminé par une réactualisation (Réactu 1 à 4)',
        note: null,
      },
      {
        code: '4.4',
        group: 'Modalités',
        label:
          "Nombre de patients dont la synthèse de l'évaluation des compétences acquises a été transmise au moins à leur médecin traitant",
        note: 'Aucun modèle ne trace cet envoi (relève du ticket « Envoi du bilan par MSSanté »)',
      },
    ])
  })
})

describe('bornes de la période', () => {
  // C1 : la borne haute arrive à minuit (`z.coerce.date()` sur « 2026-12-31 »). Une séance tenue
  // le 31 décembre dans l'après-midi doit compter : sinon l'enquête perd son dernier jour, tous
  // les ans, en silence.
  it('compte une seance tenue le dernier jour de la periode, dans l apres-midi', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({
            individual: true,
            date: new Date('2026-12-31T14:00:00Z'),
          }),
        ],
      }),
    ])
    expect(valeur(c, '2.6')).toBe(1)
  })

  it('ne compte pas une seance du surlendemain de la borne haute', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({
            individual: true,
            date: new Date('2027-01-02T09:00:00Z'),
          }),
        ],
      }),
    ])
    expect(valeur(c, '2.6')).toBe(0)
  })
})

describe('séances des patients sans sous-dossier dans le service', () => {
  // I2 : `AppointmentPatient` s'écrit SANS `PatientServiceFile` (décision assumée, voir le
  // commentaire d'`ensureExists`). Les totaux de séances comptent des SÉANCES RÉALISÉES, pas des
  // patients inscrits : une séance tenue pour un patient sans sous-dossier a bien eu lieu.
  it('compte les seances du service, meme sans dossier correspondant dans la cohorte', () => {
    const c = {
      ...PERIODE,
      files: [],
      presences: [
        presence({ patientId: 'sans-dossier', individual: true }),
        presence({
          patientId: 'sans-dossier',
          individual: false,
          slotId: 'atelier-1',
        }),
      ],
    }
    expect(valeur(c, '2.6')).toBe(1)
    expect(valeur(c, '2.7')).toBe(1)
  })

  it('compte dans 2.8 les participants sans sous-dossier', () => {
    const c = {
      ...PERIODE,
      files: [],
      presences: [
        presence({ patientId: 'a', individual: false, slotId: 'atelier-1' }),
        presence({ patientId: 'b', individual: false, slotId: 'atelier-1' }),
      ],
    }
    expect(valeur(c, '2.8')).toBe(2)
  })

  it('2.9 compte des patients distincts parmi toutes les presences du service', () => {
    const c = {
      ...PERIODE,
      files: [],
      presences: [
        presence({ patientId: 'a', accompanied: true }),
        presence({
          patientId: 'a',
          accompanied: true,
          date: new Date('2026-04-01'),
        }),
        presence({ patientId: 'b', accompanied: true }),
      ],
    }
    expect(valeur(c, '2.9')).toBe(2)
    expect(valeur(c, '2.10')).toBe(3)
  })
})

describe('orientations : la BASE stocke la CLÉ, pas le libellé', () => {
  // Défaut trouvé en vérifiant l'écran sur les données réelles : 1.1 valait 557 et 1.2/1.3/1.4
  // valaient 0 alors que 2452 dossiers portent une orientation. `toSelectOptions`
  // (`front/src/libs/utils.ts`) écrit la CLÉ du dictionnaire (`ORIENTATION_PRO_SANTE_HOSPIT`),
  // jamais son libellé (« Orientation pro santé au cours hospit »), que la grille comparait.
  it('ventile sur les cles stockees en base', () => {
    const c = cohorte([
      dossier({ orientation: 'ORIENTATION_PRO_SANTE_EXT' }),
      dossier({ patientId: 'p2', orientation: 'ORIENTATION_PRO_SANTE_HOSPIT' }),
      dossier({ patientId: 'p3', orientation: 'ORIENTATION_PRO_SANTE_CS' }),
      dossier({ patientId: 'p4', orientation: 'VENUE_SPONTANEE' }),
    ])
    expect(valeur(c, '1.2')).toBe(1)
    expect(valeur(c, '1.3')).toBe(1)
    expect(valeur(c, '1.4')).toBe(1)
  })

  it('ne ventile PAS sur les libelles affiches', () => {
    const c = cohorte([
      dossier({ orientation: 'Orientation pro santé au cours hospit' }),
    ])
    expect(valeur(c, '1.3')).toBe(0)
  })

  it('la cle accompagnant existe dans APPOINTMENT_ACCOMPANYING du front', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../../../../front/src/constants/appointment.constant.ts',
      ),
      'utf8',
    )
    const bloc = source.match(
      /export const APPOINTMENT_ACCOMPANYING = \{([^}]*)\}/,
    )
    if (!bloc) {
      throw new Error('APPOINTMENT_ACCOMPANYING introuvable')
    }
    const cles = [...bloc[1].matchAll(/^\s*([a-zA-Z_]+):/gm)].map((m) => m[1])
    expect(cles).toContain(ACCOMPANYING_YES)
  })
})

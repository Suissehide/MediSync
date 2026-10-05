import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ARS_ACCOMPANYING_YES,
  ARS_ORIENTATIONS,
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
  patientId: 'p1',
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

const cohorte = (files: ArsFile[]): ArsCohort => ({
  ...PERIODE,
  files,
  presences: files.flatMap((f) => f.presences),
})

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
    for (const r of computeArsIndicators(cohorte([]))) {
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

const reactu = (p: Partial<ArsPresence> = {}) =>
  presence({ thematicName: 'Réactu 1', ...p })

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
    const resultats = computeArsIndicators(cohorte([]))
    for (const code of ['2.3', '2.11', '3.5', '4.4']) {
      const i = resultats.find((r) => r.code === code)
      expect(i?.value).toBeNull()
      expect(i?.note).toEqual(expect.any(String))
    }
  })

  it('marque 2.5 et 4.2 comme a renseigner a la main', () => {
    const resultats = computeArsIndicators(cohorte([]))
    for (const code of ['2.5', '4.2']) {
      const i = resultats.find((r) => r.code === code)
      expect(i?.value).toBeNull()
      expect(i?.note).toContain('renseigner')
    }
  })

  it('rend les 30 indicateurs, dans l ordre des groupes', () => {
    const resultats = computeArsIndicators(cohorte([]))
    expect(resultats).toHaveLength(30)
    expect(resultats.map((r) => r.group)).toEqual([
      ...Array(5).fill('Entrée'),
      ...Array(13).fill('Séances'),
      ...Array(6).fill('Sortie'),
      ...Array(6).fill('Modalités'),
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

  // Contrat entre les deux dépôts, sur le patron d'`access-log-vocabulaire.test.ts` : les trois
  // clés doivent exister dans le dictionnaire du front. Renommer une clé là-bas sans toucher ici
  // remettrait silencieusement les trois indicateurs à zéro — c'est exactement ce qui vient
  // d'arriver.
  it('chaque cle utilisee existe dans ORIENTATION du front', () => {
    const source = readFileSync(
      join(__dirname, '../../../../../front/src/constants/patient.constant.ts'),
      'utf8',
    )
    const bloc = source.match(/export const ORIENTATION = \{([^}]*)\}/)
    if (!bloc) {
      throw new Error('ORIENTATION introuvable dans patient.constant.ts')
    }
    const clesDuFront = [...bloc[1].matchAll(/^\s*([A-Z_]+):/gm)].map(
      (m) => m[1],
    )
    expect(clesDuFront.length).toBeGreaterThanOrEqual(5)
    for (const cle of Object.values(ARS_ORIENTATIONS)) {
      expect(clesDuFront).toContain(cle)
    }
  })
  it('la cle accompagnant existe dans APPOINTMENT_ACCOMPANYING du front', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../../../front/src/constants/appointment.constant.ts',
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
    expect(cles).toContain(ARS_ACCOMPANYING_YES)
  })
})

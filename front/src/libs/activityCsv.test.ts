import { describe, expect, it } from 'vitest'

import type { ActivityReport } from '../types/activity.ts'
import { activityCsv, heures, pourcent } from './activityCsv.ts'

const vide = { absent: 0, pointed: 0, rate: null }

const rapport: ActivityReport = {
  from: '2026-01-01',
  to: '2026-12-31',
  patients: { active: 148, newlyIncluded: 57, exited: 42 },
  monthly: [],
  completion: {
    completed: 31,
    exited: 42,
    rate: 31 / 42,
    dropouts: 11,
    dropoutReasons: [{ reason: 'PERDU_DE_VUE', count: 5 }],
  },
  absences: {
    overall: { absent: 12, pointed: 100, rate: 0.12 },
    worst: { thematic: 'Coaching; PRM', weekday: 1 },
    weekdays: [1],
    byWeekday: Array.from({ length: 7 }, () => vide),
    byThematic: [
      {
        thematic: 'Coaching; PRM',
        total: { absent: 4, pointed: 10, rate: 0.4 },
        cells: [
          vide,
          { absent: 4, pointed: 10, rate: 0.4 },
          vide,
          vide,
          vide,
          vide,
          vide,
        ],
      },
    ],
    byPathway: [],
  },
  sessions: {
    individual: 312,
    collective: 96,
    educationalDiagnoses: 41,
    finalReviews: 28,
  },
  hoursBySoignant: [
    { soignant: 'IDE', hours: 120.5 },
    { soignant: 'AS', hours: 50 / 60 },
  ],
}

describe('activityCsv', () => {
  it('commence par le BOM et l en-tete, separe par des points-virgules', () => {
    const csv = activityCsv(rapport, 'Cardio')
    expect(csv.startsWith('﻿section;libellé;valeur;définition\r\n')).toBe(true)
  })

  it('ecrit le service juste avant la periode', () => {
    const csv = activityCsv(rapport, 'Cardio')
    const lignes = csv.split('\r\n')
    const indexService = lignes.findIndex((l) => l.startsWith('Service;'))
    const indexPeriode = lignes.findIndex((l) => l.startsWith('Période;'))
    expect(indexService).toBeGreaterThanOrEqual(0)
    expect(indexPeriode).toBe(indexService + 1)
    expect(lignes[indexService]).toBe('Service;Cardio;;')
  })

  it('neutralise le nom du service comme les autres libelles', () => {
    expect(activityCsv(rapport, '=Cardio')).toContain("Service;'=Cardio;;")
  })

  it('ecrit les motifs par leur libelle et les nombres decimaux a la francaise', () => {
    const csv = activityCsv(rapport, 'Cardio')
    expect(csv).toContain("Motifs d'arrêt;Perdu de vue;5;")
    expect(csv).toContain('Heures soignant;IDE;120,5;')
  })

  it('protege un libelle qui contient le separateur', () => {
    expect(activityCsv(rapport, 'Cardio')).toContain('"Coaching; PRM — mardi"')
  })

  it('formate un taux absent en tiret', () => {
    expect(pourcent(null)).toBe('—')
    expect(pourcent(0.738)).toBe('74 %')
  })

  it('arrondit les heures a une decimale, comme l ecran', () => {
    expect(heures(50 / 60)).toBe('0,8')
    expect(activityCsv(rapport, 'Cardio')).toContain('Heures soignant;AS;0,8;')
  })

  it('ecrit une ligne par mois, apres les absences par parcours', () => {
    const avecMois: ActivityReport = {
      ...rapport,
      monthly: [{ month: '2026-10', newlyIncluded: 12, exited: 9, active: 40 }],
    }
    expect(activityCsv(avecMois, 'Cardio')).toContain(
      'Entrées et sorties par mois;2026-10;12 inclus, 9 sortis, 40 en file active;',
    )
  })

  it('ecrit une ligne toutes thematiques par jour pointe', () => {
    const avecJours: ActivityReport = {
      ...rapport,
      absences: {
        ...rapport.absences,
        byWeekday: [
          { absent: 30, pointed: 136, rate: 30 / 136 },
          ...Array.from({ length: 6 }, () => vide),
        ],
      },
    }
    const csv = activityCsv(avecJours, 'Cardio')
    expect(csv).toContain('Absences toutes thématiques;lundi;22 %;30 sur 136')
    expect(csv).not.toContain('Absences toutes thématiques;mardi')
  })

  it('neutralise un libelle qui ressemble a une formule tableur', () => {
    const piege: ActivityReport = {
      ...rapport,
      absences: {
        ...rapport.absences,
        byThematic: [
          { ...rapport.absences.byThematic[0], thematic: '=SUM(A1)' },
        ],
      },
    }
    expect(activityCsv(piege, 'Cardio')).toContain(
      "Absences par thématique;'=SUM(A1);",
    )
  })
})

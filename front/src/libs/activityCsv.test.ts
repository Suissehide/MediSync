import { describe, expect, it } from 'vitest'

import type { ActivityReport } from '../types/activity.ts'
import { activityCsv, heures, pourcent } from './activityCsv.ts'

const vide = { absent: 0, pointed: 0, rate: null }

const rapport: ActivityReport = {
  from: '2026-01-01',
  to: '2026-12-31',
  patients: { active: 148, newlyIncluded: 57, exited: 42 },
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
    const csv = activityCsv(rapport)
    expect(csv.startsWith('﻿section;libellé;valeur;définition\r\n')).toBe(true)
  })

  it('ecrit les motifs par leur libelle et les nombres decimaux a la francaise', () => {
    const csv = activityCsv(rapport)
    expect(csv).toContain("Motifs d'arrêt;Perdu de vue;5;")
    expect(csv).toContain('Heures soignant;IDE;120,5;')
  })

  it('protege un libelle qui contient le separateur', () => {
    expect(activityCsv(rapport)).toContain('"Coaching; PRM — mardi"')
  })

  it('formate un taux absent en tiret', () => {
    expect(pourcent(null)).toBe('—')
    expect(pourcent(0.738)).toBe('74 %')
  })

  it('arrondit les heures a une decimale, comme l ecran', () => {
    expect(heures(50 / 60)).toBe('0,8')
    expect(activityCsv(rapport)).toContain('Heures soignant;AS;0,8;')
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
    expect(activityCsv(piege)).toContain("Absences par thématique;'=SUM(A1);")
  })
})

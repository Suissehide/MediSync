import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CLINICAL_FIELDS,
  withoutClinicalFields,
} from '../../../main/utils/clinical-fields'

describe('withoutClinicalFields', () => {
  it('retire les quatre champs cliniques et garde les champs administratifs', () => {
    const patient = {
      id: 'p1',
      firstName: 'A',
      notes: 'secret',
      details: 'secret',
      medicalDiagnosis: 'secret',
      // Donnees administratives du programme : a NE PAS filtrer.
      etpDecision: 'oui',
      goal: 'objectif',
      programType: 'type',
      stopReason: 'motif',
    }

    expect(withoutClinicalFields(patient)).toEqual({
      id: 'p1',
      firstName: 'A',
      etpDecision: 'oui',
      goal: 'objectif',
      programType: 'type',
      stopReason: 'motif',
    })
  })

  it('filtre un patient embarque par un creneau, un rendez-vous et un participant', () => {
    const slots = [
      {
        id: 's1',
        appointments: [
          {
            id: 'a1',
            appointmentPatients: [
              {
                transmissionNotes: 'secret',
                accompanying: 'conjoint',
                patient: { id: 'p1', notes: 'secret', firstName: 'A' },
              },
            ],
          },
        ],
      },
    ]

    expect(withoutClinicalFields(slots)).toEqual([
      {
        id: 's1',
        appointments: [
          {
            id: 'a1',
            appointmentPatients: [
              {
                accompanying: 'conjoint',
                patient: { id: 'p1', firstName: 'A' },
              },
            ],
          },
        ],
      },
    ])
  })

  it('ne modifie pas la charge utile recue et preserve dates et valeurs nulles', () => {
    const date = new Date('2026-01-01')
    const payload = { entryDate: date, notes: 'secret', gender: null }
    const filtered = withoutClinicalFields(payload)

    expect(payload.notes).toBe('secret')
    expect(filtered).toEqual({ entryDate: date, gender: null })
    expect((filtered as { entryDate: Date }).entryDate).toBe(date)
  })

  // Le filtrage se fait par nom de cle : il n'est sur que tant que chacun de
  // ces noms ne designe qu'un seul champ dans tout le schema. Si un modele
  // venait a reutiliser l'un d'eux, ce test tombe et impose de repasser a un
  // filtrage par forme.
  it('chaque nom de champ clinique n existe qu une fois dans le schema Prisma', () => {
    const schema = readFileSync(
      join(__dirname, '../../../../prisma/schema.prisma'),
      'utf8',
    )
    for (const field of CLINICAL_FIELDS) {
      const declarations =
        schema.match(new RegExp(`^\\s+${field}\\s`, 'gm')) ?? []
      expect({ field, count: declarations.length }).toEqual({ field, count: 1 })
    }
  })
})

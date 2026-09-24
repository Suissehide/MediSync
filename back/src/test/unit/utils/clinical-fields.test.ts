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

  // Une instance de classe traverse le filtre telle quelle : la recopier la
  // degraderait en objet nu, et la reponse differerait alors pour les seuls
  // roles sans acces clinique.
  it('laisse intactes les instances de classe et les valeurs non-objet', () => {
    class Wrapper {
      constructor(readonly label: string) {}
      toJSON() {
        return { label: this.label }
      }
    }
    const instance = new Wrapper('x')
    const buffer = Buffer.from('abc')
    const payload = { instance, buffer, notes: 'secret', count: 3, flag: false }

    const filtered = withoutClinicalFields(payload)

    expect(filtered.instance).toBe(instance)
    expect(filtered.instance).toBeInstanceOf(Wrapper)
    expect(filtered.buffer).toBe(buffer)
    expect(filtered).not.toHaveProperty('notes')
    expect(filtered).toMatchObject({ count: 3, flag: false })
  })

  // Le filtrage se fait par nom de cle : il n'est sur que tant que chaque nom
  // ne designe, dans tout le schema, que des champs effectivement cliniques.
  // `notes`, `details` et `medicalDiagnosis` en portent deux depuis l'etape 3
  // du multi-tenant (`Patient` et son sous-dossier de service
  // `PatientServiceFile`, tant que la donnee n'a pas ete migree) ;
  // `transmissionNotes` n'en porte qu'un (`AppointmentPatient`). Si un de ces
  // noms apparaissait ailleurs, ce test tombe et impose de repasser a un
  // filtrage par forme.
  it('chaque nom de champ clinique n existe que sur les modeles attendus', () => {
    const schema = readFileSync(
      join(__dirname, '../../../../prisma/schema.prisma'),
      'utf8',
    )
    const expectedCounts: Record<string, number> = {
      notes: 2,
      details: 2,
      medicalDiagnosis: 2,
      transmissionNotes: 1,
    }
    for (const field of CLINICAL_FIELDS) {
      const declarations =
        schema.match(new RegExp(`^\\s+${field}\\s`, 'gm')) ?? []
      expect({ field, count: declarations.length }).toEqual({
        field,
        count: expectedCounts[field],
      })
    }
  })
})

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
  // Plutot que de compter les occurrences (un nombre qui grimperait aussi
  // bien pour un homonyme non clinique que pour une extension legitime, et
  // qu'il suffirait de changer pour faire taire un vrai probleme), ce test
  // nomme les modeles porteurs attendus et les compare exactement a ceux du
  // schema, par le meme decoupage en blocs `model X { … }` que
  // `tenant-guard-schema.test.ts`. `notes`, `details` et `medicalDiagnosis`
  // sont portes par `Patient` et par son sous-dossier de service
  // `PatientServiceFile` (etape 3 du multi-tenant, tant que la donnee n'a
  // pas ete migree) ; `transmissionNotes` uniquement par `AppointmentPatient`.
  // Si l'un de ces noms apparaissait sur un modele non prevu ici, ce test
  // tombe et nomme le modele en trop plutot qu'un simple ecart de compte, et
  // impose de repasser a un filtrage par forme si ce modele n'est pas
  // clinique.
  it('chaque champ clinique n existe que sur les modeles attendus', () => {
    const schema = readFileSync(
      join(__dirname, '../../../../prisma/schema.prisma'),
      'utf8',
    )
    const withoutComments = schema.replace(/\/\/.*$/gm, '')

    // Blocs `model X { … }` : meme technique que tenant-guard-schema.test.ts, le schema
    // n'imbrique aucune accolade dans un bloc de modele.
    const modelsDeclaring = (field: string): string[] => {
      const declaring: string[] = []
      for (const match of withoutComments.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
        const [, name, body] = match
        if (name && body !== undefined && new RegExp(`^\\s*${field}\\s`, 'm').test(body)) {
          declaring.push(name)
        }
      }
      return declaring.sort()
    }

    const expectedModels: Record<string, string[]> = {
      notes: ['Patient', 'PatientServiceFile'],
      details: ['Patient', 'PatientServiceFile'],
      medicalDiagnosis: ['Patient', 'PatientServiceFile'],
      transmissionNotes: ['AppointmentPatient'],
    }
    for (const field of CLINICAL_FIELDS) {
      const expected = expectedModels[field]
      // Absence traitee explicitement (pas d'assertion de non-nullite) : un champ ajoute a
      // CLINICAL_FIELDS sans entree correspondante ici doit le dire, pas comparer a `undefined`.
      if (!expected) {
        throw new Error(`Aucun modele attendu declare pour le champ clinique "${field}"`)
      }
      expect({ field, models: modelsDeclaring(field) }).toEqual({
        field,
        models: [...expected].sort(),
      })
    }
  })
})

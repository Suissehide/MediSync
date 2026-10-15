import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Patient, PatientPathway } from '../../../types/patient.ts'
import { PDF_FIELD_KEYS } from '../../../types/pdfDesign.ts'
import type { Slot } from '../../../types/slot.ts'
import {
  type PdfFieldContext,
  resolveField,
  SAMPLE_FIELD_CONTEXT,
  SAMPLE_FIELD_VALUES,
} from './fields.ts'

dayjs.extend(utc)

const patient = { id: 'p1', firstName: 'Jean', lastName: 'Dupont' } as Patient

const slot = (startDate: string) =>
  ({ id: startDate, startDate, endDate: startDate }) as unknown as Slot

const pathway = (over: Partial<PatientPathway>): PatientPathway => ({
  pathwayID: 'pw1',
  templateID: 't1',
  templateName: null,
  templateColor: null,
  templateMainTag: null,
  startDate: '2026-05-11T09:00:00.000Z',
  priority: null,
  ...over,
})

const ctx = (over: Partial<PdfFieldContext> = {}): PdfFieldContext => ({
  patient,
  pathways: [],
  upcomingSlots: [],
  serviceName: 'Cardiologie',
  ...over,
})

describe('resolveField', () => {
  it('rend le nom du patient en NOM Prenom', () => {
    expect(resolveField('patient.name', ctx())).toBe('Dupont Jean')
  })

  it('rend le nom du service', () => {
    expect(resolveField('service.name', ctx())).toBe('Cardiologie')
  })

  // Chaine de replis du code actuel : templateName, sinon templateMainTag, sinon « Programme ».
  it('rend le nom du modele de parcours quand il existe', () => {
    const pathways = [
      pathway({ templateName: 'Readaptation', templateMainTag: 'RC' }),
    ]
    expect(resolveField('pathway.name', ctx({ pathways }))).toBe('Readaptation')
  })

  it('se replie sur l etiquette principale quand le modele n a pas de nom', () => {
    const pathways = [pathway({ templateName: null, templateMainTag: 'RC' })]
    expect(resolveField('pathway.name', ctx({ pathways }))).toBe('RC')
  })

  it('se replie sur Programme quand le patient n a aucun parcours', () => {
    expect(resolveField('pathway.name', ctx())).toBe('Programme')
  })

  it('se replie sur Programme quand le parcours n a ni nom ni etiquette', () => {
    expect(resolveField('pathway.name', ctx({ pathways: [pathway({})] }))).toBe(
      'Programme',
    )
  })

  it('rend les dates du programme comme la couverture actuelle', () => {
    const upcomingSlots = [
      slot('2026-05-11T09:00:00.000Z'),
      slot('2026-06-28T09:00:00.000Z'),
    ]
    expect(resolveField('program.dates', ctx({ upcomingSlots }))).toBe(
      'Du 11/05 au 28/06/2026',
    )
  })

  it('prend la premiere et la derniere date, quel que soit l ordre des creneaux', () => {
    const upcomingSlots = [
      slot('2026-06-28T09:00:00.000Z'),
      slot('2026-05-11T09:00:00.000Z'),
      slot('2026-06-01T09:00:00.000Z'),
    ]
    expect(resolveField('program.dates', ctx({ upcomingSlots }))).toBe(
      'Du 11/05 au 28/06/2026',
    )
  })

  // Review Focus 1 : aucun creneau a venir -> rien, jamais « Du Invalid Date ».
  it('rend une chaine vide quand le patient n a aucun creneau a venir', () => {
    expect(resolveField('program.dates', ctx())).toBe('')
  })
})

// Les deux faces de l'echantillon : le dictionnaire que la toile HTML affiche, et le contexte
// que l'apercu PDF resout. Elles doivent dire la meme chose, sinon basculer entre les deux
// change le texte sous les yeux de l'utilisateur.
describe('echantillon', () => {
  it.each(PDF_FIELD_KEYS)('rend la meme valeur pour %s', (key) => {
    expect(resolveField(key, SAMPLE_FIELD_CONTEXT)).toBe(
      SAMPLE_FIELD_VALUES[key],
    )
  })
})

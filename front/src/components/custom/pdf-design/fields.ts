import type { Patient, PatientPathway } from '../../../types/patient.ts'
import type { PdfFieldKey } from '../../../types/pdfDesign.ts'
import type { Slot } from '../../../types/slot.ts'
import { computeProgramDuration } from '../Patient/pdf/programme-pdf.utils.ts'

export type PdfFieldContext = {
  patient: Patient
  pathways: PatientPathway[]
  upcomingSlots: Slot[]
  serviceName: string
}

// Une donnee nouvelle = une entree ici plus son cas dans fields.test.ts.
const RESOLVERS: Record<PdfFieldKey, (ctx: PdfFieldContext) => string> = {
  'patient.name': ({ patient }) => `${patient.lastName} ${patient.firstName}`,
  'service.name': ({ serviceName }) => serviceName,
  // Meme chaine de replis que la couverture d'aujourd'hui.
  'pathway.name': ({ pathways }) => {
    const first = pathways[0]
    return first?.templateName || first?.templateMainTag || 'Programme'
  },
  // Chaine vide, jamais « Du Invalid Date » : sans creneau a venir le texte disparait, comme
  // le <Text> conditionnel de la couverture actuelle.
  'program.dates': ({ upcomingSlots }) => {
    const duration = computeProgramDuration(upcomingSlots)
    if (!duration) {
      return ''
    }
    return `Du ${duration.startDate.format('DD/MM')} au ${duration.endDate.format('DD/MM/YYYY')}`
  },
}

export const resolveField = (key: PdfFieldKey, ctx: PdfFieldContext): string =>
  RESOLVERS[key](ctx)

// Affiche dans l'editeur a la place d'un vrai patient (etape 2).
export const SAMPLE_FIELD_VALUES: Record<PdfFieldKey, string> = {
  'patient.name': 'DUPONT Jean',
  'pathway.name': 'Réadaptation cardiaque',
  'program.dates': 'Du 12/05 au 28/06/2026',
  'service.name': 'SMCV',
}

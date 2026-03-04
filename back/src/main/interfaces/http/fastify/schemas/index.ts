import { z } from 'zod/v4'

import { patientSchema } from './patient.schema'
import { soignantSchema } from './soignant.schema'

export const appointmentSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  thematic: z.string().optional().nullable(),
  type: z.string().optional().nullable(),

  get slot() {
    return z.object(slotSchema).optional().nullable()
  },

  get appointmentPatients() {
    return z.array(appointmentPatientSchema).optional().nullable()
  },
})

export const appointmentPatientSchema = z.object({
  accompanying: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  transmissionNotes: z.string().optional().nullable(),

  get patient() {
    return patientSchema.optional().nullable()
  },
})

/** Slot Template Schema */
export const slotTemplateSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  offsetDays: z.number(),

  thematic: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  color: z.string(),
  isIndividual: z.boolean(),
  capacity: z.number().optional().nullable(),
  duration: z.number().optional().nullable(),

  get soignant() {
    return soignantSchema.optional().nullable()
  },
  get template() {
    return pathwayTemplateSchema.optional().nullable()
  },
  get slots() {
    return slotSchema.optional().nullable()
  },
})

/** Slot Schema */
export const slotSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),

  get appointments() {
    return z.array(appointmentSchema).optional().nullable()
  },
  get pathway() {
    return pathwaySchema.optional().nullable()
  },
  get slotTemplate() {
    return slotTemplateSchema.optional().nullable()
  },
})

export const pathwayTemplateSchema = z.object({
  name: z.string().min(1),
  color: z.string(),
  tags: z.array(z.string()).default([]),

  get slotTemplates() {
    return z.array(slotTemplateSchema).optional().nullable()
  },
  // get pathways() {
  //   return z.array(pathwaySchema).optional().nullable()
  // },
})

export const pathwaySchema = z.object({
  startDate: z.coerce.date(),

  get template() {
    return pathwayTemplateSchema.optional().nullable()
  },
  get slots() {
    return z.array(slotSchema).optional().nullable()
  },
})

export const diagnosticEducatifTemplateSchema = z.object({
  name: z.string().min(1),
  activeFields: z.array(z.string()).default([]),
})

const s = z.string().optional().nullable()

export const diagnosticEducatifSchema = z.object({
  title: s,
  activeFields: z.array(z.string()).default([]),
  patientId: z.cuid(),
  templateId: z.cuid().optional().nullable(),

  // Facteurs de risque
  facteursRisque: s,
  contexte: s,

  // Qualité de vie
  qualiteVie: s,
  qualiteVieLibre: s,
  viePersonnelle: s,
  vieProfessionnelle: s,
  occupations: s,
  loisirs: s,

  // Implication
  implication: s,
  implicationLibre: s,

  // Priorité de santé
  prioriteSante: s,
  prioriteSanteLibre: s,

  // Connaissances maladie
  connaissancesMaladie: s,
  connaissancesMaladieLibre: s,
  mecanismes: s,
  localisations: s,
  symptomes: s,
  chronicite: s,
  reagirSignesAlerte: s,

  // Identification FDR
  identificationFDR: s,
  identificationFDRLibre: s,
  ometFDR: s,

  // Tension artérielle
  gestionTensionArterielle: s,
  gestionTensionArterielleLibre: s,
  gestionTensionArterielleSentimentAutoEfficacite: s,
  gestionTensionArterielleEtapeChangement: s,

  // HbA1c
  gestionHba1c: s,
  gestionHba1cLibre: s,
  gestionHba1cSentimentAutoEfficacite: s,
  gestionHba1cEtapeChangement: s,

  // LDL
  gestionLDL: s,
  gestionLDLLibre: s,
  gestionLDLSentimentAutoEfficacite: s,
  gestionLDLEtapeChangement: s,

  // Adhésion traitement
  adhesionTraitement: s,
  adhesionTraitementLibre: s,
  adhesionTraitementSentimentAutoEfficacite: s,
  adhesionTraitementEtapeChangement: s,

  // Alimentation
  alimentation: s,
  alimentationLibre: s,
  alimentationSentimentAutoEfficacite: s,
  alimentationEtapeChangement: s,

  // Stress
  gestionStress: s,
  gestionStressLibre: s,
  gestionStressSentimentAutoEfficacite: s,
  gestionStressEtapeChangement: s,

  // Tabac
  consommationTabac: s,
  consommationTabacNombreCigaretteJour: z.number().int().optional().nullable(),
  consommationTabacLibre: s,
  consommationTabacSentimentAutoEfficacite: s,
  consommationTabacEtapeChangement: s,

  // Tour de taille
  gestionTourTaille: s,
  gestionTourTailleLibre: s,
  gestionTourTailleSentimentAutoEfficacite: s,
  gestionTourTailleEtapeChangement: s,

  // Activité physique
  activitePhysique: s,
  activitePhysiqueLibre: s,
  activitePhysiqueSentimentAutoEfficacite: s,
  activitePhysiqueEtapeChangement: s,

  // Gestion globale FDR
  gestionFDR: s,

  // Qui est-il ?
  impactSurQualiteVie: s,
  stadeAcceptationMaladie: s,
  soutienSocial: s,
  projetDeVie: s,
  objectifsPatient: s,
  objectifsSoignants: s,
  suiviEducatifNegocie: s,
  rapatrier: s,
})

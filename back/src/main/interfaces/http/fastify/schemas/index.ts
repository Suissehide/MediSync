import { z } from 'zod/v4'

import { cuid } from './id.schema'
import { locationResponseSchema } from './location.schema'
import { patientSchema } from './patient.schema'
import { soignantSchema } from './soignant.schema'

// Les référentiels exposent `archived`, jamais la date : appelé par les routes avant d'envoyer.
export const withArchived = <T extends { archivedAt: Date | null }>({
  archivedAt,
  ...rest
}: T): Omit<T, 'archivedAt'> & { archived: boolean } => ({
  ...rest,
  archived: archivedAt !== null,
})

// Les formulaires front initialisent ces champs à '' : lu comme null, jamais renvoyé tel quel.
const emptyToNull = <T extends z.ZodType<string, string>>(schema: T) => {
  const value = schema.nullish()
  // Entrée et sortie de T sont la même chaîne, ce qu'un T générique ne laisse pas voir.
  return z.codec(z.union([z.literal(''), value]), value, {
    decode: (v) => (v === '' ? null : v) as z.input<T> | null | undefined,
    encode: (v) => v as z.output<T> | null | undefined,
  })
}

export const appointmentTypeSchema = emptyToNull(
  z.enum(['ambulatory', 'hospital', 'telephonic']),
)
export const appointmentStatusSchema = emptyToNull(z.enum(['yes', 'no']))
export const thematicIdInputSchema = emptyToNull(cuid())

// En réponse, `thematic` est le nom de la relation Thematic ; l'écriture passe par `thematicId`.
const thematicNameFromRelation = z.codec(
  z.string().nullish(),
  z.object({ name: z.string() }).nullish(),
  {
    decode: (name) => (name == null ? null : { name }),
    encode: (relation) => relation?.name ?? null,
  },
)

export const appointmentSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  // `thematic` = nom (affichage) ; `thematicId` = FK (pré-sélection formulaire).
  thematic: thematicNameFromRelation,
  thematicId: cuid().nullish(),
  type: appointmentTypeSchema,
  // Motif du rendez-vous — renseigné sur un créneau individuel uniquement.
  motif: z.string().trim().optional().nullable(),

  get slot() {
    return slotSchema.optional().nullable()
  },

  get appointmentPatients() {
    return z.array(appointmentPatientSchema).optional().nullable()
  },
})

export const appointmentPatientSchema = z.object({
  accompanying: z.string().optional().nullable(),
  status: appointmentStatusSchema,
  rejectionReason: z.string().optional().nullable(),
  transmissionNotes: z.string().optional().nullable(),
  convocationSent: z.boolean().optional(),

  get patient() {
    return patientSchema.optional().nullable()
  },
})

/** Slot Template Schema */
export const slotTemplateSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  offsetDays: z.number(),

  thematic: thematicNameFromRelation,
  thematicId: cuid().nullish(),
  locationID: cuid().optional().nullable(),
  description: z.string().optional().nullable(),
  color: z.string(),
  isIndividual: z.boolean(),
  capacity: z.number().optional().nullable(),

  get soignants() {
    return z.array(soignantSchema)
  },
  get template() {
    return pathwayTemplateSchema.optional().nullable()
  },
  get slots() {
    return slotSchema.optional().nullable()
  },
  get location() {
    return locationResponseSchema.optional().nullable()
  },
})

/** Slot Schema */
export const slotSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  locked: z.boolean().default(false),
  archivedAt: z.coerce.date().nullable().optional(),

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
  mainTag: z.string().trim().min(1),
  secondaryTags: z.array(z.string()).default([]),
  motifRequired: z.boolean().default(false),
  firstAppointmentOnly: z.boolean().default(false),
  prerequisiteIDs: z.array(cuid()).default([]),

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
  patientId: cuid(),
  templateId: cuid().optional().nullable(),

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

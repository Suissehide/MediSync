export type DiagnosticEducatifTemplate = {
  id: string
  name: string
  activeFields: string[]
}

type NS = string | null | undefined
type NI = number | null | undefined

export type DiagnosticEducatif = {
  id: string
  createdAt: string
  title: NS
  activeFields: string[]
  patientId: string
  templateId: NS

  // Facteurs de risque
  facteursRisque?: NS
  contexte?: NS

  // Qualité de vie
  qualiteVie?: NS
  qualiteVieLibre?: NS
  viePersonnelle?: NS
  vieProfessionnelle?: NS
  occupations?: NS
  loisirs?: NS

  // Implication
  implication?: NS
  implicationLibre?: NS

  // Priorité de santé
  prioriteSante?: NS
  prioriteSanteLibre?: NS

  // Connaissances maladie
  connaissancesMaladie?: NS
  connaissancesMaladieLibre?: NS
  mecanismes?: NS
  localisations?: NS
  symptomes?: NS
  chronicite?: NS
  reagirSignesAlerte?: NS

  // Identification FDR
  identificationFDR?: NS
  identificationFDRLibre?: NS
  ometFDR?: NS

  // Tension artérielle
  gestionTensionArterielle?: NS
  gestionTensionArterielleLibre?: NS
  gestionTensionArterielleSentimentAutoEfficacite?: NS
  gestionTensionArterielleEtapeChangement?: NS

  // HbA1c
  gestionHba1c?: NS
  gestionHba1cLibre?: NS
  gestionHba1cSentimentAutoEfficacite?: NS
  gestionHba1cEtapeChangement?: NS

  // LDL
  gestionLDL?: NS
  gestionLDLLibre?: NS
  gestionLDLSentimentAutoEfficacite?: NS
  gestionLDLEtapeChangement?: NS

  // Adhésion traitement
  adhesionTraitement?: NS
  adhesionTraitementLibre?: NS
  adhesionTraitementSentimentAutoEfficacite?: NS
  adhesionTraitementEtapeChangement?: NS

  // Alimentation
  alimentation?: NS
  alimentationLibre?: NS
  alimentationSentimentAutoEfficacite?: NS
  alimentationEtapeChangement?: NS

  // Stress
  gestionStress?: NS
  gestionStressLibre?: NS
  gestionStressSentimentAutoEfficacite?: NS
  gestionStressEtapeChangement?: NS

  // Tabac
  consommationTabac?: NS
  consommationTabacNombreCigaretteJour?: NI
  consommationTabacLibre?: NS
  consommationTabacSentimentAutoEfficacite?: NS
  consommationTabacEtapeChangement?: NS

  // Tour de taille
  gestionTourTaille?: NS
  gestionTourTailleLibre?: NS
  gestionTourTailleSentimentAutoEfficacite?: NS
  gestionTourTailleEtapeChangement?: NS

  // Activité physique
  activitePhysique?: NS
  activitePhysiqueLibre?: NS
  activitePhysiqueSentimentAutoEfficacite?: NS
  activitePhysiqueEtapeChangement?: NS

  // Gestion FDR
  gestionFDR?: NS

  // Qui est-il ?
  impactSurQualiteVie?: NS
  stadeAcceptationMaladie?: NS
  soutienSocial?: NS
  projetDeVie?: NS
  objectifsPatient?: NS
  objectifsSoignants?: NS
  suiviEducatifNegocie?: NS
  rapatrier?: NS
}

export type CreateDiagnosticEducatifParams = {
  title?: string
  activeFields?: string[]
  templateId?: string
  patientId: string
  [key: string]: unknown
}

export type UpdateDiagnosticEducatifParams = {
  id: string
  patientId: string
  activeFields?: string[]
  [key: string]: unknown
}

export type CreateDiagnosticEducatifTemplateParams = {
  name: string
  activeFields: string[]
}

export type UpdateDiagnosticEducatifTemplateParams = {
  id: string
  name?: string
  activeFields?: string[]
}

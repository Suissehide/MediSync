export type FieldType = 'text' | 'textarea' | 'number'

export type DiagnosticField = {
  id: string   // = nom exact de la colonne Prisma (camelCase)
  label: string
  type: FieldType
}

export type DiagnosticSection = {
  id: string
  label: string
  group: string  // titre h2 de regroupement
  fields: DiagnosticField[]
}

export const DIAGNOSTIC_SECTIONS: DiagnosticSection[] = [
  // ─── Facteurs de risque ───────────────────────────────────────────────────
  {
    id: 'facteurs_risque',
    label: 'Facteurs de risque',
    group: 'Facteurs de risque',
    fields: [
      { id: 'facteursRisque', label: 'Facteurs de risque identifiés', type: 'text' },
      { id: 'contexte',       label: 'Contexte',                      type: 'textarea' },
    ],
  },

  // ─── Qu'est-ce qu'il fait ? ───────────────────────────────────────────────
  {
    id: 'qualite_vie',
    label: 'Qualité de vie',
    group: "Qu'est-ce qu'il fait ?",
    fields: [
      { id: 'qualiteVie',         label: 'Qualité de vie',       type: 'text' },
      { id: 'qualiteVieLibre',    label: 'Précisions',           type: 'textarea' },
      { id: 'viePersonnelle',     label: 'Vie personnelle',      type: 'textarea' },
      { id: 'vieProfessionnelle', label: 'Vie professionnelle',  type: 'textarea' },
      { id: 'occupations',        label: 'Occupations',          type: 'textarea' },
      { id: 'loisirs',            label: 'Loisirs',              type: 'textarea' },
    ],
  },

  // ─── Qu'est-ce qu'il a ? ─────────────────────────────────────────────────
  {
    id: 'implication',
    label: 'Implication',
    group: "Qu'est-ce qu'il a ?",
    fields: [
      { id: 'implication',      label: 'Implication du patient', type: 'text' },
      { id: 'implicationLibre', label: 'Précisions',             type: 'textarea' },
    ],
  },
  {
    id: 'priorite_sante',
    label: 'Priorité de santé',
    group: "Qu'est-ce qu'il a ?",
    fields: [
      { id: 'prioriteSante',      label: 'Priorité de santé', type: 'text' },
      { id: 'prioriteSanteLibre', label: 'Précisions',        type: 'textarea' },
    ],
  },

  // ─── Qu'est-ce qu'il sait ? — Savoir ─────────────────────────────────────
  {
    id: 'connaissances_maladie',
    label: 'Connaissances sur la maladie CV',
    group: "Qu'est-ce qu'il sait ? — Savoir",
    fields: [
      { id: 'connaissancesMaladie',      label: 'Niveau de connaissance',      type: 'text' },
      { id: 'connaissancesMaladieLibre', label: 'Précisions',                  type: 'textarea' },
      { id: 'mecanismes',                label: 'Mécanismes',                  type: 'textarea' },
      { id: 'localisations',             label: 'Localisations',               type: 'textarea' },
      { id: 'symptomes',                 label: 'Symptômes',                   type: 'textarea' },
      { id: 'chronicite',                label: 'Chronicité',                  type: 'textarea' },
      { id: 'reagirSignesAlerte',        label: "Réagir aux signes d'alerte",  type: 'textarea' },
    ],
  },
  {
    id: 'identification_fdr',
    label: 'Identification de ses FDR',
    group: "Qu'est-ce qu'il sait ? — Savoir",
    fields: [
      { id: 'identificationFDR',      label: 'Identification des FDR', type: 'text' },
      { id: 'identificationFDRLibre', label: 'Précisions',             type: 'textarea' },
      { id: 'ometFDR',                label: 'FDR omis',               type: 'textarea' },
    ],
  },

  // ─── Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être ─────────────────
  {
    id: 'gestion_tension_arterielle',
    label: 'Gestion de la tension artérielle',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'gestionTensionArterielle',                        label: 'Niveau',                         type: 'text' },
      { id: 'gestionTensionArterielleLibre',                   label: 'Précisions',                     type: 'textarea' },
      { id: 'gestionTensionArterielleSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité",    type: 'textarea' },
      { id: 'gestionTensionArterielleEtapeChangement',         label: 'Étape de changement',            type: 'textarea' },
    ],
  },
  {
    id: 'gestion_hba1c',
    label: "Gestion de l'HbA1c",
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'gestionHba1c',                        label: 'Niveau',                      type: 'text' },
      { id: 'gestionHba1cLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'gestionHba1cSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'gestionHba1cEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'gestion_ldl',
    label: 'Gestion du LDL',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'gestionLDL',                        label: 'Niveau',                      type: 'text' },
      { id: 'gestionLDLLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'gestionLDLSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'gestionLDLEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'adhesion_traitement',
    label: 'Adhésion au traitement',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'adhesionTraitement',                        label: 'Niveau',                      type: 'text' },
      { id: 'adhesionTraitementLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'adhesionTraitementSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'adhesionTraitementEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'alimentation',
    label: 'Alimentation',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'alimentation',                        label: 'Niveau',                      type: 'text' },
      { id: 'alimentationLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'alimentationSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'alimentationEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'gestion_stress',
    label: 'Gestion du stress',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'gestionStress',                        label: 'Niveau',                      type: 'text' },
      { id: 'gestionStressLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'gestionStressSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'gestionStressEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'consommation_tabac',
    label: 'Consommation de tabac',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'consommationTabac',                        label: 'Statut tabagique',            type: 'text' },
      { id: 'consommationTabacNombreCigaretteJour',     label: 'Cigarettes par jour',         type: 'number' },
      { id: 'consommationTabacLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'consommationTabacSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'consommationTabacEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'gestion_tour_taille',
    label: 'Gestion du tour de taille',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'gestionTourTaille',                        label: 'Niveau',                      type: 'text' },
      { id: 'gestionTourTailleLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'gestionTourTailleSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'gestionTourTailleEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'activite_physique',
    label: 'Activité physique',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'activitePhysique',                        label: 'Niveau',                      type: 'text' },
      { id: 'activitePhysiqueLibre',                   label: 'Précisions',                  type: 'textarea' },
      { id: 'activitePhysiqueSentimentAutoEfficacite', label: "Sentiment d'auto-efficacité", type: 'textarea' },
      { id: 'activitePhysiqueEtapeChangement',         label: 'Étape de changement',         type: 'textarea' },
    ],
  },
  {
    id: 'gestion_fdr',
    label: 'Gestion des FDR',
    group: "Qu'est-ce qu'il sait ? — Savoir-faire / Savoir-être",
    fields: [
      { id: 'gestionFDR', label: 'Niveau global de gestion des FDR', type: 'text' },
    ],
  },

  // ─── Qui est-il ? ─────────────────────────────────────────────────────────
  {
    id: 'profil_patient',
    label: 'Profil du patient',
    group: 'Qui est-il ?',
    fields: [
      { id: 'impactSurQualiteVie',     label: 'Impact sur la qualité de vie',      type: 'text' },
      { id: 'stadeAcceptationMaladie', label: "Stade d'acceptation de la maladie", type: 'text' },
      { id: 'soutienSocial',           label: 'Soutien social',                    type: 'textarea' },
      { id: 'projetDeVie',             label: 'Projet de vie',                     type: 'textarea' },
    ],
  },
  {
    id: 'objectifs_suivi',
    label: 'Objectifs et suivi',
    group: 'Qui est-il ?',
    fields: [
      { id: 'objectifsPatient',     label: 'Objectifs du patient',      type: 'textarea' },
      { id: 'objectifsSoignants',   label: 'Objectifs soignants',       type: 'textarea' },
      { id: 'suiviEducatifNegocie', label: 'Suivi éducatif négocié',    type: 'textarea' },
      { id: 'rapatrier',            label: 'Rapatrier',                 type: 'textarea' },
    ],
  },
]

export const ALL_FIELD_IDS = DIAGNOSTIC_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.id)
)

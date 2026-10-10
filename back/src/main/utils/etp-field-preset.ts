import type { CategoryDateField } from './service-field-types'

// Configuration initiale des services existants : reprise exacte des constantes front d'avant la migration service_fields.
export type EtpFieldPreset = {
  key: string
  label: string
  type: 'choice' | 'longtext'
  section: 'pathway' | 'outcome'
  clinical: boolean
  choices: readonly { key: string; label: string }[]
}

// Ancienne section d'un champ → date de la catégorie qui le reçoit.
export const SECTION_DATE_FIELD = {
  pathway: 'entryDate',
  outcome: 'exitDate',
} as const satisfies Record<EtpFieldPreset['section'], CategoryDateField>

const choices = (dict: Record<string, string>) =>
  Object.entries(dict).map(([key, label]) => ({ key, label }))

export const ETP_FIELD_PRESET: readonly EtpFieldPreset[] = [
  {
    key: 'medicalDiagnosis',
    label: 'Diagnostic médical',
    type: 'choice',
    section: 'pathway',
    clinical: true,
    choices: choices({
      AOMI: 'AOMI',
      AVC: 'AVC',
      CORONAROPATHIE: 'CORONAROPATHIE',
      PREVENTION: 'PREVENTION',
    }),
  },
  {
    key: 'careMode',
    label: 'Mode de prise en charge',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({
      AMBU: 'Ambu',
      HDJ: 'HDJ',
      HDS: 'HDS',
      HOSPIT: 'Hospit',
    }),
  },
  {
    key: 'orientation',
    label: 'Orientation',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({
      NS: 'NS',
      ORIENTATION_PRO_SANTE_HOSPIT: 'Orientation pro santé au cours hospit',
      ORIENTATION_PRO_SANTE_CS: 'Orientation pro santé en Cs',
      ORIENTATION_PRO_SANTE_EXT: 'Orientation pro santé ext hôpital',
      VENUE_SPONTANEE: 'Venue spontanée',
    }),
  },
  {
    key: 'etpDecision',
    label: 'ETP décision',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({ NON: 'Non', OUI: 'Oui' }),
  },
  {
    key: 'programType',
    label: 'Type de programme',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({ VIVA: 'ViVa', VIVA_AOMI: 'ViVa module AOMI' }),
  },
  {
    key: 'nonInclusionDetails',
    label: 'Précision non inclusion',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({
      ABSENCE_BESOINS_EDUCATIFS: 'Absence de besoins éducatifs',
      ABSENCE_CRITERES_MEDICAUX: "Absence de critères médicaux d'inclusion",
      BARRIERE_LANGUE: 'Barrière de la langue',
      DISTANCE_HABITATION: "Distance  d'habitation",
      INDISPONIBILITE: 'Indisponibilité',
      MANQUE_MOTIVATION: 'Manque de motivation',
      NS: 'NS',
      PRISE_CHARGE_BESOINS_QUOTIDIENS: 'Prise en charge des besoins quotidiens',
      PROBLEME_SANTE: 'Problème de santé',
      PROBLEMES_MEDICAUX: 'Problèmes médicaux à régler',
      REFUS: 'Refus',
      TRANSPORT: 'Transport',
      TROUBLES_COGNITIFS: 'Troubles cognitifs',
      TROUBLES_PSYCHIATRIQUES: 'Troubles psychiatriques',
    }),
  },
  {
    key: 'customContentDetails',
    label: 'Précision contenu personnalisé',
    type: 'longtext',
    section: 'pathway',
    clinical: false,
    choices: [],
  },
  {
    key: 'goal',
    label: 'Objectif',
    type: 'longtext',
    section: 'pathway',
    clinical: false,
    choices: [],
  },
  {
    key: 'stopReason',
    label: "Motif d'arrêt de programme",
    type: 'choice',
    section: 'outcome',
    clinical: false,
    choices: choices({
      ABSENCE_BESOINS_EDUCATIFS: 'Absence besoins éducatifs',
      ABSENCE_CRITERES_MEDICAUX: "Absence de critères médicaux d'inclusion",
      BARRIERE_LANGUE: 'Barrière de la langue',
      DISTANCE_HABITATION: "Distance d'habitation",
      DECES: 'Décès',
      DEMENAGEMENT: 'Déménagement',
      INDISPONIBILITE: 'Indisponibilité',
      MANQUE_MOTIVATION: 'Manque de motivation',
      NS: 'NS',
      PERDU_DE_VUE: 'Perdu de vue',
      PLUS_BESOIN_FIN_PARCOURS: 'Plus de besoin/Fin de parcours',
      PRISE_CHARGE_BESOINS_QUOTIDIENS: 'Prise en charge besoins quotidiens',
      PROBLEME_SANTE: 'Problème de santé',
      PROBLEMES_MEDICAUX: 'Problèmes médicaux à régler',
      REFUS: 'Refus',
      SOUHAIT_ARRET: 'Souhait arrêt',
      TRANSPORT: 'Transport',
      TROUBLES_COGNITIFS: 'Troubles cognitifs',
      TROUBLES_PSYCHIATRIQUES: 'Troubles psychiatriques',
    }),
  },
  {
    key: 'etpFinalOutcome',
    label: 'Point final parcours ETP',
    type: 'choice',
    section: 'outcome',
    clinical: false,
    choices: choices({
      ATELIER: 'Atelier',
      ATELIER_INFORMATION: 'Atelier information',
      BCVS: 'BCVs',
      CONSULTATION: 'Consultation',
      DE: 'DE',
      ENTRETIEN_INDIVIDUEL: 'Entretien individuel',
      M12: 'M12',
      M3: 'M3',
      RENF1: 'Renf1',
      RENF2: 'Renf2',
      SUIVI_TELEPHONIQUE: 'Suivi téléphonique',
    }),
  },
]

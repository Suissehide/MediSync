import { toSelectOptions } from '../libs/utils.ts'

export const GENDER = {
  male: 'Homme',
  female: 'Femme',
  other: 'Autre',
}

export const DISTANCE = {
  CUB: 'CUB',
  GIRONDE: 'Gironde',
  HORS_GIRONDE: 'Hors Gironde',
} as const

export const EDUCATION_LEVEL = {
  aucun: 'Aucun',
  primaire: 'Primaire',
  secondaire: 'Secondaire',
  universitaire: 'Universitaire',
}

export const OCCUPATION = {
  AGRICULTEUR: 'Agriculteur',
  ARTISANS_COMMERCANTS_CHEFS: "Artisans, commerçants et chefs d'entreprises",
  AUTRE: 'Autre',
  CADRES_PROF_INTELLECTUELLES:
    'Cadres et professions intellectuelles supérieures',
  EMPLOYES: 'Employés',
  MERE_AU_FOYER: 'Mère au foyer',
  OUVRIERS: 'Ouvriers',
  PROFESSIONS_INTERMEDIAIRES: 'Professions intermédiaires',
}

export const CURRENT_ACTIVITY = {
  ACTIF: 'Actif',
  ARRET_MALADIE: 'Arrêt maladie',
  AUTRE: 'Autre',
  CHOMAGE: 'Chômage',
  INVALIDITE: 'Invalidité',
  RMI_RSA: 'RMI/RSA',
  RETRAITE: 'Retraité',
  SANS_EMPLOI: 'Sans emploi',
}

export const MEDICAL_DIAGNOSIS = {
  AOMI: 'AOMI',
  AVC: 'AVC',
  CORONAROPATHIE: 'CORONAROPATHIE',
  PREVENTION: 'PREVENTION',
}

export const CARE_MODE = {
  AMBU: 'Ambu',
  HDJ: 'HDJ',
  HDS: 'HDS',
  HOSPIT: 'Hospit',
}

export const ORIENTATION = {
  NS: 'NS',
  ORIENTATION_PRO_SANTE_HOSPIT: 'Orientation pro santé au cours hospit',
  ORIENTATION_PRO_SANTE_CS: 'Orientation pro santé en Cs',
  ORIENTATION_PRO_SANTE_EXT: 'Orientation pro santé ext hôpital',
  VENUE_SPONTANEE: 'Venue spontanée',
}

export const ETP_DECISION = {
  NON: 'Non',
  OUI: 'Oui',
}

export const PROGRAM_TYPE = {
  VIVA: 'ViVa',
  VIVA_AOMI: 'ViVa module AOMI',
}

export const NON_INCLUSION_DETAILS = {
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
}

export const STOP_REASON = {
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
}

export const ETP_FINAL_OUTCOME = {
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
}

export const GENDER_OPTIONS = toSelectOptions(GENDER)
export const DISTANCE_OPTIONS = toSelectOptions(DISTANCE)
export const EDUCATION_LEVEL_OPTIONS = toSelectOptions(EDUCATION_LEVEL)
export const OCCUPATION_OPTIONS = toSelectOptions(OCCUPATION)
export const CURRENT_ACTIVITY_OPTIONS = toSelectOptions(CURRENT_ACTIVITY)

export const MEDICAL_DIAGNOSIS_OPTIONS = toSelectOptions(MEDICAL_DIAGNOSIS)
export const CARE_MODE_OPTIONS = toSelectOptions(CARE_MODE)
export const ORIENTATION_OPTIONS = toSelectOptions(ORIENTATION)
export const ETP_DECISION_OPTIONS = toSelectOptions(ETP_DECISION)
export const PROGRAM_TYPE_OPTIONS = toSelectOptions(PROGRAM_TYPE)
export const NON_INCLUSION_DETAILS_OPTIONS = toSelectOptions(
  NON_INCLUSION_DETAILS,
)

export const STOP_REASON_OPTIONS = toSelectOptions(STOP_REASON)
export const ETP_FINAL_OUTCOME_OPTIONS = toSelectOptions(ETP_FINAL_OUTCOME)

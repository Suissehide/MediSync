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

export const GENDER_OPTIONS = toSelectOptions(GENDER)
export const DISTANCE_OPTIONS = toSelectOptions(DISTANCE)
export const EDUCATION_LEVEL_OPTIONS = toSelectOptions(EDUCATION_LEVEL)
export const OCCUPATION_OPTIONS = toSelectOptions(OCCUPATION)
export const CURRENT_ACTIVITY_OPTIONS = toSelectOptions(CURRENT_ACTIVITY)

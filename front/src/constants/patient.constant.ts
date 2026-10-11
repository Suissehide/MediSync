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

export const GENDER_OPTIONS = toSelectOptions(GENDER)
export const DISTANCE_OPTIONS = toSelectOptions(DISTANCE)
export const EDUCATION_LEVEL_OPTIONS = toSelectOptions(EDUCATION_LEVEL)
export const OCCUPATION_OPTIONS = toSelectOptions(OCCUPATION)
export const CURRENT_ACTIVITY_OPTIONS = toSelectOptions(CURRENT_ACTIVITY)

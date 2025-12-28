import { toSelectOptions } from '../libs/utils.ts'

export const SLOT_DURATION = {
  15: '15 minutes',
  30: '30 minutes',
  45: '45 minutes',
  60: '60 minutes',
  90: '90 minutes',
  120: '120 minutes',
}

export const SLOT_LOCATION = {
  'office-1': 'Bureau 1',
  'office-5': 'Bureau 5',
  'office-6': 'Bureau 6',
  'office-7': 'Bureau 7',
  'teaching-room': 'Salle enseignement',
  'visio-room': 'Salle visio sous-sol',
  'therapeutic-kitchen': 'Cuisine thérapeutique',
  'rehab-1': 'Salle réadaptation 1',
  'rehab-2': 'Salle réadaptation 2',
  'meditation-room': 'Salle méditation',
  'medical-1': 'Bureau médical 1',
  'medical-2': 'Bureau médical 2',
  'meeting-1': 'Salle réunion 1 (étage 2)',
  'meeting-2': 'Salle réunion 2 (étage 2)',
}

export const SLOT_DURATION_OPTIONS = Object.entries(SLOT_DURATION).map(
  ([value, label]) => ({ value: Number(value), label }),
)
export const SLOT_LOCATION_OPTIONS = toSelectOptions(SLOT_LOCATION)

/* TODO: Api for thematics */

type RoleThemesRule = {
  roles: string[]
  themes: string[]
}

export const THEMATICS = [
  {
    roles: ['IDE SSR'],
    themes: [
      'Connaissances Maladie / FDR / Signes d’alerte',
      'Tabac – Première consultation',
      'Tabac – Consultation de suivi',
      'Motivation Tabac',
      'Motivation Activité Physique',
      'Diabète',
      'Pré-diabète',
      'HTA',
      'Médicaments',
    ],
  },
  {
    roles: ['IDE Educ 1', 'IDE Educ 2', 'IDE Educ 3'],
    themes: [
      'Diagnostic Éducatif – Bilan CEPTA',
      'Diagnostic Éducatif – HDJ SMR',
      'Diagnostic Éducatif – Ambulatoire',
      'Réactu 1',
      'Réactu 2',
      'Réactu 3',
      'Réactu 4',
      'Connaissances Maladie / FDR / Signes d’alerte',
      'Motivation Activité Physique',
      'Motivation Tabac',
      'Motivation Alimentation',
      'Motivation Médicaments',
      'Motivation plusieurs FDR / Objectifs',
      'Diabète',
      'Pré-diabète',
      'HTA',
    ],
  },
  {
    roles: ['Aide-soignante'],
    themes: [
      'Coaching PRM M1 / M2',
      'Coaching PRM M2 / M3',
      'Coaching PRM M3 +',
    ],
  },
  {
    roles: ['Psychologue'],
    themes: [
      'Gestion du stress',
      'Vécu de la maladie',
      'Première consultation psychologique',
      'Consultation psychologique de suivi',
    ],
  },
  {
    roles: ['Diététicienne', 'Pharmacienne'],
    themes: [
      'Entretien éducatif – Bilan CEPTA',
      'Première consultation',
      'Consultation de suivi',
    ],
  },
]

export function getThemeOptionsByRole(rules: RoleThemesRule[], role: string) {
  const themes = rules
    .filter((rule) => rule.roles.includes(role))
    .flatMap((rule) => rule.themes)

  return [...new Set(themes)].map((label) => ({
    value: label,
    label,
  }))
}

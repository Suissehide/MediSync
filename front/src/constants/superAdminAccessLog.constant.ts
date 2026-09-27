import { toSelectOptions } from '../libs/utils.ts'
import type { SuperAdminAccessLogSource } from '../types/superAdminAccessLog.ts'
import { ACCESS_LOG_ACTION_LABELS } from './accessLog.constant.ts'
import { ACTION_LABELS } from './activityLog.constant.ts'

// Étape 4b, tâche 11 : l'écran plateforme lit UN SEUL des deux journaux à la fois (`source`
// obligatoire côté back — voir le commentaire de `superAdminAccessLogSourceSchema`, back) : jamais
// un merge des deux (leurs colonnes ne se recouvrent qu'en partie, voir le commentaire du schéma
// back). Ce fichier ne redéfinit aucun libellé d'action : les deux dictionnaires existent déjà,
// chacun éprouvé par l'écran qui les a introduits (`ACTION_LABELS` par `activity-log.tsx`,
// `ACCESS_LOG_ACTION_LABELS` par `patient/$patientID/acces.tsx`) — il choisit juste lequel des
// deux s'applique, selon la source actuellement affichée.
export const SUPER_ADMIN_ACCESS_LOG_SOURCE_OPTIONS: { value: SuperAdminAccessLogSource; label: string }[] = [
  { value: 'acces', label: 'Journal des consultations' },
  { value: 'activite', label: "Journal d'activité" },
]

export const superAdminAccessLogActionLabels = (
  source: SuperAdminAccessLogSource,
): Record<string, string> => (source === 'activite' ? ACTION_LABELS : ACCESS_LOG_ACTION_LABELS)

export const superAdminAccessLogActionOptions = (source: SuperAdminAccessLogSource) =>
  toSelectOptions(superAdminAccessLogActionLabels(source))

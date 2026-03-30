import { toSelectOptions } from '../libs/utils.ts'

export const ACTION_LABELS: Record<string, string> = {
  'patient.created': 'Patient créé',
  'patient.updated': 'Patient modifié',
  'patient.deleted': 'Patient supprimé',
  'patient.enrolled': 'Patient inscrit à un parcours',
  'diagnostic.created': 'Diagnostic créé',
  'diagnostic.updated': 'Diagnostic modifié',
  'appointment.created': 'Rendez-vous créé',
  'appointment.updated': 'Rendez-vous modifié',
}

export const ACTION_OPTIONS = toSelectOptions(ACTION_LABELS)

export const TYPE_LABELS: Record<string, string> = {
  patient: 'Patient',
  diagnostic: 'Diagnostic',
  appointment: 'Rendez-vous',
  slot: 'Créneau',
  slotTemplate: 'Template',
  pathway: 'Parcours',
}

export const PERIOD_DAYS: Record<string, string> = {
  '7': '7 derniers jours',
  '30': '30 derniers jours',
  '90': '3 derniers mois',
  '365': '12 derniers mois',
}

export const PERIOD_OPTIONS = toSelectOptions(PERIOD_DAYS)

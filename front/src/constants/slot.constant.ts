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

import { toSelectOptions } from '../libs/utils.ts'

export const APPOINTMENT_THEMATIC = {
  'm1/m2': 'M1 / M2',
  'm2/m3': 'M2 / M3',
  'm3-and-more': 'M3 et +',
}

export const APPOINTMENT_TYPE = {
  ambulatory: 'Ambulatoire',
  hospital: 'Hôpital',
  telephonic: 'Téléphonique',
}

export const APPOINTMENT_STATUS = {
  yes: 'Oui',
  no: 'Non',
}

export const APPOINTMENT_ACCOMPANYING = {
  yes: 'Oui',
  no: 'Non',
}

export const APPOINTMENT_THEMATIC_OPTIONS =
  toSelectOptions(APPOINTMENT_THEMATIC)
export const APPOINTMENT_TYPE_OPTIONS = toSelectOptions(APPOINTMENT_TYPE)
export const APPOINTMENT_STATUS_OPTIONS = toSelectOptions(APPOINTMENT_STATUS)
export const APPOINTMENT_ACCOMPANYING_OPTIONS = toSelectOptions(
  APPOINTMENT_ACCOMPANYING,
)

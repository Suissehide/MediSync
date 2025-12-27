import { toSelectOptions } from '../libs/utils.ts'

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

export const APPOINTMENT_TYPE_OPTIONS = toSelectOptions(APPOINTMENT_TYPE)
export const APPOINTMENT_STATUS_OPTIONS = toSelectOptions(APPOINTMENT_STATUS)
export const APPOINTMENT_ACCOMPANYING_OPTIONS = toSelectOptions(
  APPOINTMENT_ACCOMPANYING,
)

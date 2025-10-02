import type { Slot } from './slot.ts'
import type { Patient } from './patient.ts'

export type Appointment = {
  id: string
  startDate: string
  endDate: string
  slot: Slot
  thematic?: string
  type?: string
  accompanying?: string
  status?: string
  rejectionReason?: string
  transmissionNotes?: string
  patients: Patient[]
}

export type CreateAppointmentParams = Pick<
  Appointment,
  'startDate' | 'endDate' | 'thematic' | 'type' | 'transmissionNotes'
> & { slotID: string; patientIDs?: string[] }
export type UpdateAppointmentParams = Pick<
  Appointment,
  | 'id'
  | 'thematic'
  | 'type'
  | 'accompanying'
  | 'status'
  | 'rejectionReason'
  | 'transmissionNotes'
> & { slotID?: string; patientIDs?: string[] }

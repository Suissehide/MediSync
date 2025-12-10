import type { Patient } from './patient.ts'

export type AppointmentPatient = {
  id?: string
  accompanying?: string
  status?: string
  rejectionReason?: string
  transmissionNotes?: string
  patient: Patient
}

export type CreateAppointmentPatientParams = Pick<
  AppointmentPatient,
  'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & { patientID: string }

export type UpdateAppointmentPatientParams = Pick<
  AppointmentPatient,
  'id' | 'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & { patientID: string }

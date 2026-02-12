import type {
  AppointmentPatient,
  Prisma,
} from '../../../../../generated/client'

export type AppointmentPatientEntityRepo = AppointmentPatient

export type AppointmentPatientUpdateEntityRepo = Pick<
  Prisma.AppointmentPatientUncheckedCreateInput,
  'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & {
  id?: string
  appointmentID?: string
  patientID?: string
}

import type {
  AppointmentPatient,
  UpdateAppointmentPatientParams,
} from './appointmentPatient.ts'
import type { Slot } from './slot.ts'

export type Appointment = {
  id: string
  startDate: string
  endDate: string
  slot: Slot
  thematic?: string
  type?: string
  appointmentPatients: AppointmentPatient[]
}

export type CreateAppointmentParams = Pick<
  Appointment,
  'startDate' | 'endDate' | 'thematic' | 'type'
> & { slotID: string; patientIDs: string[] }

export type UpdateAppointmentParams = Pick<
  Appointment,
  'id' | 'thematic' | 'type'
> & { slotID?: string; appointmentPatients: UpdateAppointmentPatientParams[] }

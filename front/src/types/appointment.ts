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
  thematicId?: string | null
  type?: string
  appointmentPatients: AppointmentPatient[]
}

export type CreateAppointmentParams = Pick<
  Appointment,
  'startDate' | 'endDate' | 'thematicId' | 'type'
> & { slotID: string; patientIDs: string[] }

export type UpdateAppointmentParams = Pick<
  Appointment,
  'id' | 'thematicId' | 'type'
> & { slotID?: string; appointmentPatients: UpdateAppointmentPatientParams[] }

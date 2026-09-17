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
  /** Motif du rendez-vous — saisi sur un créneau individuel uniquement. */
  motif?: string | null
  appointmentPatients: AppointmentPatient[]
}

export type CreateAppointmentParams = Pick<
  Appointment,
  'startDate' | 'endDate' | 'thematicId' | 'type' | 'motif'
> & { slotID: string; patientIDs: string[] }

export type UpdateAppointmentParams = Pick<
  Appointment,
  'id' | 'thematicId' | 'type' | 'motif'
> & { slotID?: string; appointmentPatients: UpdateAppointmentPatientParams[] }

import type { Appointment, Prisma } from '../../../../../generated/client'
import type {
  AppointmentPatientAddEntityRepo,
  AppointmentPatientEntityRepo,
  AppointmentPatientUpdateEntityRepo,
} from './appointmentPatient.repository.interface'
import type { PatientEntityRepo } from './patient.repository.interface'

export type AppointmentEntityRepo = Appointment
export type AppointmentWithPatientsRepo = AppointmentEntityRepo & {
  appointmentPatients: (AppointmentPatientEntityRepo & {
    patient: PatientEntityRepo
  })[]
}
// Le repository pose serviceId/establishmentId (tenant) lui-même :
// l'appelant ne les fournit pas. `appointmentPatients` (la relation brute
// Prisma) est omise au profit du seul `patientIDs` ci-dessous, que le
// repository transforme en lignes AppointmentPatient (par une création de
// premier niveau, pas une écriture imbriquée — voir le commentaire de
// `AppointmentRepository.create`).
export type AppointmentCreateEntityRepo = Omit<
  Prisma.AppointmentUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'appointmentPatients'
> & {
  slotID: string
  patientIDs: string[]
  transmissionNotes?: string
}
export type AppointmentUpdateEntityRepo = Omit<
  Prisma.AppointmentUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'appointmentPatients'
> & {
  slotID?: string
  // Optionnel : si absent, les participants ne sont pas modifiés ;
  // un tableau vide supprime explicitement le rendez-vous.
  appointmentPatients?: AppointmentPatientUpdateEntityRepo[]
}

export interface AppointmentRepositoryInterface {
  findAll: () => Promise<AppointmentEntityRepo[]>
  findByID: (
    id: string,
  ) => Promise<
    AppointmentWithPatientsRepo & { thematic: { name: string } | null }
  >
  create: (
    appointmentCreateParams: AppointmentCreateEntityRepo,
  ) => Promise<AppointmentEntityRepo>
  update: (
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityRepo,
  ) => Promise<AppointmentEntityRepo>
  addPatientToAppointment: (
    appointmentPatientUpdateParams: AppointmentPatientAddEntityRepo,
  ) => Promise<AppointmentPatientEntityRepo>
  setConvocationSent: (
    appointmentID: string,
    appointmentPatientID: string,
    convocationSent: boolean,
  ) => Promise<void>
  delete: (appointmentID: string) => Promise<AppointmentEntityRepo>
  deleteOrphanedByIds: (appointmentIDs: string[]) => Promise<number>
}

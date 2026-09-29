import type {
  AppointmentPatient,
  Prisma,
} from '../../../../../generated/client'

export type AppointmentPatientEntityRepo = AppointmentPatient

// `patientID` est requis dans les deux usages de ce type (les schémas HTTP
// correspondants — `updateAppointmentPatientByIdSchema.body`,
// `appointment.schema.ts` `appointmentPatients[]` — l'exigent tous les
// deux, jamais en optionnel) : un élément de mise à jour désigne toujours
// un patient, qu'il s'agisse d'un participant existant ou d'un nouveau.
// `id`, lui, reste optionnel : absent, il distingue un nouveau participant
// (upsert en création) d'un participant déjà inscrit (upsert en mise à
// jour).
export type AppointmentPatientUpdateEntityRepo = Pick<
  Prisma.AppointmentPatientUncheckedCreateInput,
  'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & {
  id?: string
  patientID: string
}

// `addPatientToAppointment` ajoute un participant à un rendez-vous déjà
// identifié par son id, contrairement aux éléments de la liste
// `AppointmentUpdateEntityRepo.appointmentPatients` (le rendez-vous y est
// déjà connu du paramètre `appointmentID` de `update`) : `appointmentID`
// est donc requis ici, jamais optionnel.
export type AppointmentPatientAddEntityRepo =
  AppointmentPatientUpdateEntityRepo & {
    appointmentID: string
  }

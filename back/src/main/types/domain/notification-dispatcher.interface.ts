import type { SessionSnapshot } from '../infra/orm/repositories/notification-context.repository.interface'

export type { SessionSnapshot }

// Appele par les domaines ; chaque methode hors `snapshot` est void, en tache de fond, sans echec.
export interface NotificationDispatcherInterface {
  snapshot: (appointmentIds: string[]) => Promise<SessionSnapshot[]>
  patientsAdded: (
    actorId: string,
    appointmentId: string,
    patientIds: string[],
  ) => void
  absent: (actorId: string, appointmentId: string, patientIds: string[]) => void
  moved: (
    actorId: string,
    appointmentId: string,
    before: { startDate: Date; locationName: string | null },
    after?: { startDate: Date },
  ) => void
  cancelled: (actorId: string, snapshots: SessionSnapshot[]) => void
  enrolled: (
    actorId: string,
    patientId: string,
    appointmentIds: string[],
  ) => void
  slotFilled: (actorId: string, slotId: string) => void
}

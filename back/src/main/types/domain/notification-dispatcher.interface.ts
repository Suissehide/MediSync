import type { SessionSnapshot } from '../infra/orm/repositories/notification-context.repository.interface'

export type { SessionSnapshot }

// Appele directement par les domaines. Chaque methode (hors `snapshot`) rend la
// main tout de suite : le travail se fait en tache de fond et attrape toute
// erreur (voir NotificationDispatcher) — une notification ratee n'echoue jamais
// l'action metier.
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
  ) => void
  cancelled: (actorId: string, snapshots: SessionSnapshot[]) => void
  enrolled: (
    actorId: string,
    patientId: string,
    appointmentIds: string[],
  ) => void
  slotFilled: (actorId: string, slotId: string) => void
}

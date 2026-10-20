import type {
  NotificationType,
  ThematicRole,
} from '../../../../../generated/enums'

// Lectures hors tenant (planificateur, Task 5) : chaque methode porte ses propres bornes
// (dates, statut) plutot que de lire tenantContext.scope(), qui leverait sous runAsSystem.

export type UpcomingAppointmentRow = {
  establishmentId: string
  serviceId: string
  appointmentId: string
  slotId: string
  startDate: Date
  thematicName: string | null
  locationName: string | null
  soignantIds: string[]
}

export type DiagnosticDueRow = {
  establishmentId: string
  serviceId: string
  patientServiceFileId: string
  patientId: string
  patientName: string
  entryDate: Date
}

export type PathwayEndedRow = {
  establishmentId: string
  serviceId: string
  pathwayId: string
  patientId: string
  patientName: string
  lastDate: Date
}

export type TaskDueRow = {
  establishmentId: string
  serviceId: string
  taskId: string
  text: string
  dueDate: Date
  assigneeUserIds: string[]
  soignantIds: string[]
}

export type MemberBySoignantRow = {
  serviceId: string
  soignantId: string
  userId: string
}

export type SoignantOfRoleRow = {
  serviceId: string
  soignantId: string
}

export type ScheduledNotificationRow = {
  establishmentId: string
  serviceId: string
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  dedupeKey: string
}

export interface NotificationScheduleRepositoryInterface {
  upcomingAppointments: (
    from: Date,
    to: Date,
  ) => Promise<UpcomingAppointmentRow[]>
  entryDatesWithoutDiagnostic: (
    from: Date,
    to: Date,
  ) => Promise<DiagnosticDueRow[]>
  pathwaysEnded: (from: Date, to: Date) => Promise<PathwayEndedRow[]>
  tasksDue: (day: Date) => Promise<TaskDueRow[]>
  membersBySoignant: (serviceIds: string[]) => Promise<MemberBySoignantRow[]>
  soignantsOfThematicRole: (
    serviceIds: string[],
    role: ThematicRole,
  ) => Promise<SoignantOfRoleRow[]>
  purgeOlderThan: (date: Date) => Promise<number>
  // skipDuplicates (meme forme que NotificationRepository.createMany) : rend le nombre reellement
  // insere, pour que runOnce rapporte un compte exact plutot que la taille du lot propose.
  createNotifications: (rows: ScheduledNotificationRow[]) => Promise<number>
}

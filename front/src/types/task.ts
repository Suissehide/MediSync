export type Task = {
  id: string
  text: string
  authorId: string | null
  assigneeIds: string[]
  soignantIds: string[]
  patient: { id: string; firstName: string; lastName: string } | null
  dueDate: string | null
  doneAt: string | null
  createdAt: string
}

export type NotificationType =
  | 'MENTION'
  | 'REMINDER'
  | 'PATIENT_ADDED'
  | 'APPOINTMENT_MOVED'
  | 'APPOINTMENT_CANCELLED'
  | 'ABSENT'
  | 'DIAGNOSTIC_DUE'
  | 'PATHWAY_END'
  | 'SLOT_ALMOST_FULL'
  | 'TASK_DUE'

// Forme figee du payload MENTION (inchange depuis l'etape 1) : les huit autres types se lisent
// via les petites fonctions de lecture de `notificationTypes.tsx`, le payload restant generique.
export type MentionPayload = {
  taskId: string
  authorId: string | null
  text: string
}

export type Notification = {
  id: string
  type: NotificationType
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

export type CreateTaskInput = {
  text: string
  assigneeIds: string[]
  soignantIds: string[]
  patientId?: string
  dueDate?: string
}

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

// Payload MENTION fige depuis l'etape 1 ; les autres types se lisent via `notificationTypes.tsx`.
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

export type Task = {
  id: string
  text: string
  authorId: string | null
  assigneeIds: string[]
  patient: { id: string; firstName: string; lastName: string } | null
  dueDate: string | null
  doneAt: string | null
  createdAt: string
}

export type Notification = {
  id: string
  type: 'MENTION'
  payload: { taskId: string; authorId: string | null; text: string }
  readAt: string | null
  createdAt: string
}

export type CreateTaskInput = {
  text: string
  assigneeIds: string[]
  patientId?: string
  dueDate?: string
}

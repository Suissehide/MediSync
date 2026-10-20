import type { Task } from '../../../../../generated/client'

export type TaskEntityRepo = Task & {
  assignees: { userId: string }[]
  soignants: { soignantId: string }[]
}
export type TaskCreateEntityRepo = {
  text: string
  authorId: string
  assigneeIds: string[]
  soignantIds: string[]
  // Destinataires MENTION, deja dedupliques et prives de l'auteur par le domaine.
  notifyUserIds: string[]
  patientId: string | null
  dueDate: Date | null
}
export type PatientName = { id: string; firstName: string; lastName: string }

export interface TaskRepositoryInterface {
  findAll: (doneSince: Date) => Promise<TaskEntityRepo[]>
  createWithMentions: (input: TaskCreateEntityRepo) => Promise<TaskEntityRepo>
  setDone: (taskId: string, doneAt: Date | null) => Promise<TaskEntityRepo>
  isPatientInService: (patientId: string) => Promise<boolean>
  findPatientNames: (patientIds: string[]) => Promise<PatientName[]>
}

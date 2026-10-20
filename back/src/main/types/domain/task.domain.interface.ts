export type TaskDTO = {
  id: string
  text: string
  authorId: string | null
  assigneeIds: string[]
  patient: { id: string; firstName: string; lastName: string } | null
  dueDate: string | null
  doneAt: Date | null
  createdAt: Date
}
export type TaskCreateDomain = {
  text: string
  assigneeIds: string[]
  patientId?: string
  dueDate?: string
}

export type TaskDomainInterface = {
  findAll: () => Promise<TaskDTO[]>
  create: (input: TaskCreateDomain) => Promise<TaskDTO>
  setDone: (taskId: string, done: boolean) => Promise<TaskDTO>
}

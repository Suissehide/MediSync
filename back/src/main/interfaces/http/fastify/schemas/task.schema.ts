import { z } from 'zod/v4'

export const taskResponseSchema = z.object({
  id: z.string(),
  text: z.string(),
  authorId: z.string().nullable(),
  assigneeIds: z.array(z.string()),
  patient: z
    .object({ id: z.string(), firstName: z.string(), lastName: z.string() })
    .nullable(),
  dueDate: z.string().nullable(),
  doneAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
export const tasksResponseSchema = z.array(taskResponseSchema)

export const createTaskSchema = z.object({
  text: z.string().trim().min(1).max(500),
  assigneeIds: z.array(z.string()).max(20).default([]),
  patientId: z.string().optional(),
  dueDate: z.iso.date().optional(),
})

export const taskParamsSchema = z.object({ taskId: z.string() })
export const setTaskDoneSchema = z.object({ done: z.boolean() })

export type CreateTaskBody = z.infer<typeof createTaskSchema>
export type TaskParams = z.infer<typeof taskParamsSchema>
export type SetTaskDoneBody = z.infer<typeof setTaskDoneSchema>

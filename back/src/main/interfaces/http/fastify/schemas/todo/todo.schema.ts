import { z } from 'zod'

const todoEntity = {
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  completed: z.boolean().default(false),
  createDate: z.coerce.date(),
}

export const todoSchema = z.object({
  ...todoEntity,
})

export const todoResponseSchema = z.object({
  id: z.string().cuid(),
  ...todoEntity,
})

export const todosResponseSchema = z.array(todoResponseSchema)

export const getTodoByIdParamsSchema = z.object({
  todoID: z.string().cuid(),
})

export const createTodoSchema = z.object(todoEntity).pick({
  title: true,
  description: true,
})

export const deleteTodoByIdParamsSchema = getTodoByIdParamsSchema

export const updateTodoByIdSchema = {
  params: getTodoByIdParamsSchema,
  body: todoSchema
    .omit({ createDate: true })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be updated',
    }),
}

export type TodoInput = z.infer<typeof todoSchema>
export type TodoResponse = z.infer<typeof todoResponseSchema>

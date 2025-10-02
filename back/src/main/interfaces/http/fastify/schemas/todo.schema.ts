import { z } from 'zod/v4'

export const todoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  completed: z.boolean().default(false),
  createDate: z.coerce.date(),
})

export const todoResponseSchema = todoSchema.extend({
  id: z.cuid(),
})

export const todosResponseSchema = z.array(todoResponseSchema)

export const getTodoByIdParamsSchema = z.object({
  todoID: z.cuid(),
})

export const createTodoSchema = todoSchema.pick({
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
export type GetTodoByIdParams = z.infer<typeof getTodoByIdParamsSchema>
export type CreateTodoBody = z.infer<typeof createTodoSchema>
export type UpdateTodoParams = z.infer<typeof updateTodoByIdSchema.params>
export type UpdateTodoBody = z.infer<typeof updateTodoByIdSchema.body>
export type DeleteTodoByIdParams = z.infer<typeof deleteTodoByIdParamsSchema>
export type TodoResponse = z.infer<typeof todoResponseSchema>

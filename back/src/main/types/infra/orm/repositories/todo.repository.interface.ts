import type { Prisma, Todo } from '@prisma/client'

export type TodoEntityRepo = Todo
export type TodoCreateEntityRepo = Prisma.TodoUncheckedCreateInput
export type TodoUpdateEntityRepo = Prisma.TodoUncheckedUpdateInput

export interface TodoRepositoryInterface {
  findAll: () => Promise<TodoEntityRepo[]>
  findByID: (todoID: string) => Promise<TodoEntityRepo>
  create: (todoCreateParams: TodoCreateEntityRepo) => Promise<TodoEntityRepo>
  update: (
    todoID: string,
    todoUpdateParams: TodoUpdateEntityRepo,
  ) => Promise<TodoEntityRepo>
  delete: (todoID: string) => Promise<TodoEntityRepo>
}

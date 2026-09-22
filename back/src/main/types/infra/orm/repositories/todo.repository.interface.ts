import type {
  Prisma,
  Todo,
} from '../../../../../generated/client'

export type TodoEntityRepo = Todo
// Le repository pose serviceId/establishmentId (tenant) et soignantID (profil
// soignant courant) lui-meme : l'appelant ne les fournit pas.
export type TodoCreateEntityRepo = Omit<
  Prisma.TodoUncheckedCreateInput,
  'serviceId' | 'establishmentId' | 'soignantID'
>
export type TodoUpdateEntityRepo = Omit<
  Prisma.TodoUncheckedUpdateInput,
  'serviceId' | 'establishmentId'
>

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

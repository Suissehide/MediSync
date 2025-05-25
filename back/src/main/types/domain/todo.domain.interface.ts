import type {
  TodoCreateEntityRepo,
  TodoEntityRepo,
  TodoUpdateEntityRepo,
} from '../infra/orm/repositories/todo.repository.interface'

export type TodoEntityDomain = TodoEntityRepo
export type TodoCreateEntityDomain = Pick<
  TodoCreateEntityRepo,
  'title' | 'description'
>
export type TodoUpdateEntityDomain = Pick<
  TodoUpdateEntityRepo,
  'title' | 'description' | 'completed'
>

export type TodoDomainInterface = {
  findAll: () => Promise<TodoEntityDomain[]>
  findByID: (todoID: string) => Promise<TodoEntityDomain>
  create: (
    todoCreateParams: TodoCreateEntityDomain,
  ) => Promise<TodoEntityDomain>
  update: (
    todoID: string,
    todoUpdateParams: TodoUpdateEntityDomain,
  ) => Promise<TodoEntityDomain>
  delete: (todoID: string) => Promise<TodoEntityDomain>
}

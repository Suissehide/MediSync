import type { Soignant } from './soignant.ts'

export type Todo = {
  id: string
  title: string
  description?: string
  createDate: Date
  completed: boolean
  soignant?: Soignant | null
}

export type CreateTodoParams = Pick<Todo, 'title' | 'description'> & {
  soignantID?: string
}
export type UpdateTodoParams = Pick<
  Todo,
  'id' | 'title' | 'description' | 'completed'
> & { soignantID?: string }

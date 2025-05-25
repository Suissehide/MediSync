export type Todo = {
  id: string
  title: string
  description?: string
  createDate: Date
  completed: boolean
  assignTo: string
}

export type CreateTodoParams = Pick<Todo, 'title' | 'description' | 'assignTo'>
export type UpdateTodoParams = Pick<
  Todo,
  'id' | 'title' | 'description' | 'completed'
>

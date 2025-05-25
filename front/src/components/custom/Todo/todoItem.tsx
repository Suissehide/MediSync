import type { Todo } from '../../../types/todo.ts'
import dayjs from 'dayjs'
import { Calendar, Check, UserRound, Trash2 } from 'lucide-react'
import { useTodoMutations } from '../../../hooks/queries/useTodo.ts'

interface checkboxProps {
  checked: boolean
  setChecked: (value: boolean) => void
}

const Checkbox = ({ checked, setChecked }: checkboxProps) => {
  return (
    <button
      type="button"
      onClick={() => setChecked(!checked)}
      className={`cursor-pointer flex justify-center items-center h-5 w-5 border-1 border-border-dark rounded-full text-white ${checked ? 'bg-primary border-primary' : 'bg-transparent'}`}
    >
      {checked ? <Check className="w-3 h-3" /> : null}
    </button>
  )
}

interface todoItemProps {
  todo: Todo
}

export default function TodoItem({ todo }: todoItemProps) {
  const { updateTodo, deleteTodo } = useTodoMutations()

  const date = dayjs(todo.createDate).format('dddd DD MMM')

  const handleUpdateTodo = (todo: Todo) => {
    updateTodo.mutate(todo)
  }

  return (
    <div
      className={`group text-sm bg-background px-6 py-4 rounded-lg ${todo.completed ? 'bg-border' : ''}`}
    >
      <div className="flex justify-between items-center">
        <div className={`flex gap-4 ${todo.completed ? 'items-center' : ''}`}>
          <div className="pt-0.5">
            <Checkbox
              checked={todo.completed}
              setChecked={() =>
                handleUpdateTodo({ ...todo, completed: !todo.completed })
              }
            />
          </div>
          <div>
            <div className={`${todo.completed ? 'line-through' : ''}`}>
              {todo.title}
            </div>
            <span className={`${todo.completed ? 'hidden' : ''}`}>
              <div className="text-text-light">{todo.description}</div>
              <div className="flex items-center gap-2 pt-1 text-text-light text-[12px]">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {date}
                </div>

                {todo.assignTo ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-text-light rounded-full" />
                    <div className="flex items-center gap-1">
                      <UserRound className="w-3 h-3" />
                      <span>{todo.assignTo}</span>
                    </div>
                  </span>
                ) : null}
              </div>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => deleteTodo.mutate(todo.id)}
          className="cursor-pointer flex opacity-0 items-center p-2 rounded-full text-destructive group-hover:opacity-100 hover:bg-card"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

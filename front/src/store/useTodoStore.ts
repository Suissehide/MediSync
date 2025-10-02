import { create } from 'zustand'
import type { Todo } from '../types/todo.ts'
import { devtools } from 'zustand/middleware'

interface TodoState {
  todos: Todo[]
  hasNewTodos: boolean
}

interface TodoActions {
  addTodo: (todo: Todo) => void
  setTodos: (todos: Todo[]) => void
  markTodosAsSeen: () => void
}

export const useTodoStore = create<TodoState & TodoActions>()(
  devtools((set) => ({
    todos: [],
    hasNewTodos: false,

    setTodos: (todos: Todo[]) =>
      set(
        () => ({
          todos: todos,
          hasNewTodos: true,
        }),
        false,
        'setTodos',
      ),

    addTodo: (todo: Todo) =>
      set(
        (state) => ({
          todos: [...state.todos, todo],
          hasNewTodos: true,
        }),
        false,
        'addTodo',
      ),

    markTodosAsSeen: () =>
      set({ hasNewTodos: false }, false, 'markTodosAsSeen'),
  })),
)

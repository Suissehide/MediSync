import { create } from 'zustand'
import type { Todo } from '../types/todo.ts'

interface TodoState {
  todos: Todo[]
  hasNewTodos: boolean
}

interface TodoActions {
  addTodo: (todo: Todo) => void
  setTodos: (todos: Todo[]) => void
  markTodosAsSeen: () => void
}

export const useTodoStore = create<TodoState & TodoActions>((set) => ({
  todos: [],
  hasNewTodos: false,

  setTodos: (todos: Todo[]) =>
    set(() => ({
      todos: todos,
      hasNewTodos: true,
    })),

  addTodo: (todo: Todo) =>
    set((state) => ({
      todos: [...state.todos, todo],
      hasNewTodos: true,
    })),

  markTodosAsSeen: () => set({ hasNewTodos: false }),
}))

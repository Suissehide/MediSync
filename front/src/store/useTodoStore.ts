import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

import type { Todo } from '../types/todo.ts'

interface TodoState {
  todos: Todo[]
  seenTodoIds: Set<string>
}

interface TodoActions {
  addTodo: (todo: Todo) => void
  setTodos: (todos: Todo[]) => void
  markTodosAsSeen: () => void
}

export const useTodoStore = create<TodoState & TodoActions>()(
  devtools(
    persist(
      (set) => ({
        todos: [],
        seenTodoIds: new Set<string>(),

        setTodos: (todos: Todo[]) =>
          set(
            () => ({
              todos: todos,
            }),
            false,
            'setTodos',
          ),

        addTodo: (todo: Todo) =>
          set(
            (state) => ({
              todos: [...state.todos, todo],
            }),
            false,
            'addTodo',
          ),

        markTodosAsSeen: () =>
          set(
            (state) => ({
              seenTodoIds: new Set(state.todos.map((todo) => todo.id)),
            }),
            false,
            'markTodosAsSeen',
          ),
      }),
      {
        name: 'todo-storage',
        partialize: (state) => ({ seenTodoIds: Array.from(state.seenTodoIds) }),
        merge: (persisted, current) => ({
          ...current,
          seenTodoIds: new Set((persisted as { seenTodoIds: string[] })?.seenTodoIds ?? []),
        }),
      },
    ),
  ),
)

export const selectHasNewTodos = (state: TodoState & TodoActions): boolean =>
  state.todos.some((todo) => !state.seenTodoIds.has(todo.id))

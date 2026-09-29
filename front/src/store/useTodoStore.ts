import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

import type { Todo } from '../types/todo.ts'
import { scopedStorage } from './scoped-storage.ts'

interface TodoState {
  todos: Todo[]
  seenTodoIds: Set<string>
}

interface TodoActions {
  addTodo: (todo: Todo) => void
  setTodos: (todos: Todo[]) => void
  markTodosAsSeen: () => void
  reset: () => void
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

        // Appelee au changement de contexte. `todos` est un miroir en memoire
        // des taches du service, affiche par plusieurs ecrans et exclu du
        // `partialize` : rien d'autre ne le remet a zero. `seenTodoIds` reste
        // en place — ce sont des identifiants opaques, jamais affiches, et
        // ils sont persistes pour ne pas re-signaler comme nouvelles des
        // taches deja vues.
        reset: () =>
          set(
            () => ({
              todos: [],
            }),
            false,
            'reset',
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
        storage: scopedStorage('todo-storage'),
        partialize: (state) => ({ seenTodoIds: Array.from(state.seenTodoIds) }),
        merge: (persisted, current) => ({
          ...current,
          seenTodoIds: new Set(
            (persisted as { seenTodoIds: string[] })?.seenTodoIds ?? [],
          ),
        }),
      },
    ),
  ),
)

export const selectHasNewTodos = (state: TodoState & TodoActions): boolean =>
  state.todos.some((todo) => !state.seenTodoIds.has(todo.id))

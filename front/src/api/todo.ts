import type { CreateTodoParams, Todo, UpdateTodoParams } from '../types/todo.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import { apiUrl } from '../constants/config.constant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const TodoApi = {
  getAll: async (): Promise<Todo[]> => {
    const response = await fetchWithAuth(`${apiUrl}/todo?action=getAllTodos`, {
      method: 'GET',
    })
    if (!response.ok) {
      console.log('error')
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des tâches',
      )
    }
    return response.json()
  },

  create: async (createTodoParams: CreateTodoParams): Promise<Todo> => {
    const response = await fetchWithAuth(`${apiUrl}/todo?action=createTodo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createTodoParams),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une tâche')
    }
    return response.json()
  },

  update: async (updateTodoParams: UpdateTodoParams): Promise<Todo> => {
    const { id: todoID, ...updateTodoInputs } = updateTodoParams
    const response = await fetchWithAuth(
      `${apiUrl}/todo/${todoID}?action=updateTodo`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateTodoInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la tâche')
    }
    return response.json()
  },

  delete: async (todoID: string): Promise<Todo> => {
    const response = await fetchWithAuth(
      `${apiUrl}/todo/${todoID}?action=deleteTodo`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la tâche')
    }
    return response.json()
  },
}

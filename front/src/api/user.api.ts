import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { UpdateUserParams, User } from '../types/auth.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const UserApi = {
  getAll: async (): Promise<User[]> => {
    const response = await fetchWithAuth(`${apiUrl}/user?action=getAllUsers`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des rendez-vous',
      )
    }
    return response.json()
  },

  getByID: async (userID: string): Promise<User> => {
    const response = await fetchWithAuth(
      `${apiUrl}/user/${userID}?action=getUserByID`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        `Impossible de récupérer le rendez-vous avec l'id : ${userID}`,
      )
    }
    return response.json()
  },

  update: async (updateUserParams: UpdateUserParams): Promise<User> => {
    const { id: userID, ...updateUserInputs } = updateUserParams
    const response = await fetchWithAuth(
      `${apiUrl}/user/${userID}?action=updateUser`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateUserInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le rendez-vous')
    }
    return response.json()
  },

  delete: async (userID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${apiUrl}/user/${userID}?action=deleteUser`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le rendez-vous')
    }
    return
  },
}

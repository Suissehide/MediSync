import { apiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { NotificationPrefs } from '@/types/notificationPrefs.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Hors tenant, sous `/me` : sur le compte courant uniquement (back/src/main/interfaces/http/fastify/routes/me.ts).
const url = `${apiUrl}/me/notification-preferences`

export const NotificationPrefsApi = {
  get: async (): Promise<NotificationPrefs> => {
    const response = await fetchWithAuth(url, { method: 'GET' })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les préférences')
    }
    return response.json()
  },

  update: async (prefs: NotificationPrefs): Promise<NotificationPrefs> => {
    const response = await fetchWithAuth(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible d'enregistrer les préférences")
    }
    return response.json()
  },
}

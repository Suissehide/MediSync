import { apiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { Patient } from '@/types/patient.ts'
import type { ServiceMember } from '@/types/serviceMember.ts'
import type { Soignant } from '@/types/soignant.ts'
import type { CreateTaskInput, Notification, Task } from '@/types/task.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Les panneaux de la topbar lisent TOUS les services du compte : le service est une donnee de la requete.
export type ServiceRef = { establishmentId: string; serviceId: string }

const url = (s: ServiceRef, path: string) =>
  `${apiUrl}/e/${s.establishmentId}/s/${s.serviceId}${path}`

const send = async (
  s: ServiceRef,
  path: string,
  init: RequestInit,
  error: string,
) => {
  const response = await fetchWithAuth(url(s, path), init)
  if (!response.ok) {
    handleHttpError(response, {}, error)
  }
  return response
}

const json = { 'Content-Type': 'application/json' }

export const InboxApi = {
  tasks: async (s: ServiceRef): Promise<Task[]> =>
    (
      await send(
        s,
        '/taches',
        { method: 'GET' },
        'Impossible de charger les tâches',
      )
    ).json(),
  createTask: async (s: ServiceRef, input: CreateTaskInput): Promise<Task> =>
    (
      await send(
        s,
        '/taches',
        { method: 'POST', headers: json, body: JSON.stringify(input) },
        'Impossible de créer la tâche',
      )
    ).json(),
  setTaskDone: async (
    s: ServiceRef,
    taskId: string,
    done: boolean,
  ): Promise<Task> =>
    (
      await send(
        s,
        `/taches/${taskId}`,
        { method: 'PATCH', headers: json, body: JSON.stringify({ done }) },
        'Impossible de modifier la tâche',
      )
    ).json(),
  notifications: async (s: ServiceRef): Promise<Notification[]> =>
    (
      await send(
        s,
        '/notifications',
        { method: 'GET' },
        'Impossible de charger les notifications',
      )
    ).json(),
  markRead: async (s: ServiceRef, id: string): Promise<void> => {
    await send(
      s,
      `/notifications/${id}/lu`,
      { method: 'POST' },
      'Impossible de marquer la notification comme lue',
    )
  },
  markAllRead: async (s: ServiceRef): Promise<void> => {
    await send(
      s,
      '/notifications/tout-lu',
      { method: 'POST' },
      'Impossible de tout marquer comme lu',
    )
  },
  members: async (s: ServiceRef): Promise<ServiceMember[]> =>
    (
      await send(
        s,
        '/membres',
        { method: 'GET' },
        'Impossible de charger les membres du service',
      )
    ).json(),
  patients: async (s: ServiceRef): Promise<Patient[]> =>
    (
      await send(
        s,
        '/patient',
        { method: 'GET' },
        'Impossible de charger les patients',
      )
    ).json(),
  soignants: async (s: ServiceRef): Promise<Soignant[]> =>
    (
      await send(
        s,
        '/soignant',
        { method: 'GET' },
        'Impossible de charger les soignants du service',
      )
    ).json(),
}

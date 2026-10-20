import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'

import { InboxApi, type ServiceRef } from '@/api/inbox.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { CreateTaskInput, Notification, Task } from '@/types/task.ts'
import { SERVICE_PERMISSIONS } from '@/utils/permissions.ts'

export type InboxService = ServiceRef & {
  name: string
  canTasks: boolean
  // Le metier (Soignant) que je incarne dans ce service, pour « pour moi » et la pastille.
  soignantId: string | null
}
export type InboxTask = Task & { service: InboxService }
export type InboxNotification = Notification & { service: InboxService }

const live = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const
// Cles exactes de la spec (Front > Donnees) : ['taches', serviceId] et ['notifications', serviceId].
const keys = {
  tasks: (s: ServiceRef) => ['taches', s.serviceId],
  notifications: (s: ServiceRef) => ['notifications', s.serviceId],
}

// Vraies affectations seulement : ni coordinateur implicite, ni octroi temporaire.
export const useInboxServices = (): InboxService[] => {
  const user = useAuthStore((state) => state.user)
  return useMemo(
    () =>
      (user?.establishments ?? []).flatMap((e) =>
        e.services
          .filter((s) => s.affecte !== false)
          .map((s) => ({
            establishmentId: e.id,
            serviceId: s.id,
            name: s.name,
            canTasks: SERVICE_PERMISSIONS[s.role].includes('tasks:read'),
            soignantId: s.soignantId ?? null,
          })),
      ),
    [user],
  )
}

export const useTasks = (services: InboxService[]) => {
  const withTasks = services.filter((s) => s.canTasks)
  return useQueries({
    queries: withTasks.map((s) => ({
      queryKey: keys.tasks(s),
      queryFn: () => InboxApi.tasks(s),
      ...live,
    })),
    combine: (results) => ({
      tasks: results.flatMap((r, i) =>
        (r.data ?? []).map((t) => ({
          ...t,
          service: withTasks[i] as InboxService,
        })),
      ),
      isLoading: results.some((r) => r.isLoading),
    }),
  })
}

export const useNotifications = (services: InboxService[]) =>
  useQueries({
    queries: services.map((s) => ({
      queryKey: keys.notifications(s),
      queryFn: () => InboxApi.notifications(s),
      ...live,
    })),
    combine: (results) => ({
      notifications: results.flatMap((r, i) =>
        (r.data ?? []).map((n) => ({
          ...n,
          service: services[i] as InboxService,
        })),
      ),
    }),
  })

export const useServiceMembers = (service: InboxService | undefined) =>
  useQuery({
    queryKey: ['inbox', 'membres', service?.serviceId],
    queryFn: () => InboxApi.members(service as InboxService),
    enabled: service !== undefined,
    staleTime: 5 * 60_000,
  }).data ?? []

export const useServiceSoignants = (service: InboxService | undefined) =>
  useQuery({
    queryKey: ['inbox', 'soignants', service?.serviceId],
    queryFn: () => InboxApi.soignants(service as InboxService),
    enabled: service !== undefined,
    staleTime: 5 * 60_000,
  }).data ?? []

export const useServicePatients = (
  service: InboxService | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['inbox', 'patients', service?.serviceId],
    queryFn: () => InboxApi.patients(service as InboxService),
    enabled: enabled && service !== undefined,
    staleTime: 5 * 60_000,
  }).data ?? []

export const useInboxMutations = () => {
  const client = useQueryClient()
  const refreshTasks = (s: ServiceRef) =>
    client.invalidateQueries({ queryKey: keys.tasks(s) })
  const refreshNotifications = (s: ServiceRef) =>
    client.invalidateQueries({ queryKey: keys.notifications(s) })
  return {
    createTask: useMutation({
      mutationFn: ({
        service,
        input,
      }: {
        service: InboxService
        input: CreateTaskInput
      }) => InboxApi.createTask(service, input),
      onSuccess: (_task, { service }) => refreshTasks(service),
    }),
    setTaskDone: useMutation({
      mutationFn: ({ task, done }: { task: InboxTask; done: boolean }) =>
        InboxApi.setTaskDone(task.service, task.id, done),
      onSettled: (_r, _e, { task }) => refreshTasks(task.service),
    }),
    markRead: useMutation({
      mutationFn: (n: InboxNotification) => InboxApi.markRead(n.service, n.id),
      onSettled: (_r, _e, n) => refreshNotifications(n.service),
    }),
    markAllRead: useMutation({
      mutationFn: (services: InboxService[]) =>
        Promise.all(services.map((s) => InboxApi.markAllRead(s))),
      onSettled: (_r, _e, services) =>
        Promise.all(services.map(refreshNotifications)),
    }),
  }
}

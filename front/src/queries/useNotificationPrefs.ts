import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { NotificationPrefsApi } from '@/api/notificationPrefs.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { NotificationPrefs } from '@/types/notificationPrefs.ts'

export const NOTIFICATION_PREFS_KEY = ['notification-prefs']

export const useNotificationPrefsQuery = () =>
  useQuery({
    queryKey: NOTIFICATION_PREFS_KEY,
    queryFn: NotificationPrefsApi.get,
  })

export const useUpdateNotificationPrefs = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: NotificationPrefsApi.update,
    onSuccess: (data: NotificationPrefs) =>
      client.setQueryData(NOTIFICATION_PREFS_KEY, data),
  })
}

// Une case par vraie affectation du compte (ni coordinateur implicite, ni octroi), tous établissements confondus.
export const useAccountServices = (): {
  id: string
  establishment: string
  service: string
}[] => {
  const user = useAuthStore((state) => state.user)
  return useMemo(
    () =>
      (user?.establishments ?? []).flatMap((e) =>
        e.services
          .filter((s) => s.affecte !== false)
          .map((s) => ({ id: s.id, establishment: e.name, service: s.name })),
      ),
    [user],
  )
}

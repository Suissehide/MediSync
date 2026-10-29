import { z } from 'zod/v4'

import { NOTIFICATION_PREF_KEYS } from '../../../../utils/notification-prefs'

const prefKeyBooleans = () =>
  z.object(
    Object.fromEntries(
      NOTIFICATION_PREF_KEYS.map((k) => [k, z.boolean()]),
    ) as Record<(typeof NOTIFICATION_PREF_KEYS)[number], z.ZodBoolean>,
  )

export const notificationPrefsSchema = z.object({
  level: z.enum(['all', 'essential', 'custom']),
  services: z.array(z.string()).min(1).nullable(),
  reminderDelay: z.enum(['eve', '2h', '1h']),
  app: prefKeyBooleans(),
  mail: prefKeyBooleans(),
  digest: z.enum(['now', 'daily']),
})
export type NotificationPrefsBody = z.infer<typeof notificationPrefsSchema>

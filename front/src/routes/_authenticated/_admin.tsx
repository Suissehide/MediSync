import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { can } from '../../hooks/useCan.ts'
import { deriveContext } from '../../store/useAuthStore.ts'
import type { Permission } from '../../utils/permissions.ts'

// Permissions couvrant les écrans de réglages : certaines de niveau service
// (coordinateur), d'autres de niveau établissement (administrateur). La
// branche admet quiconque détient au moins l'une d'elles ; chaque écran, et
// chaque entrée du menu, se garde ensuite par sa propre permission.
const ADMIN_SETTINGS_PERMISSIONS: Permission[] = [
  'planning:write',
  'soignants:manage',
  'referentials:write',
  'locations:manage',
  'members:manage',
  'activity-log:read',
]

const hasAdminSettingsAccess = (
  context: ReturnType<typeof deriveContext>,
): boolean => ADMIN_SETTINGS_PERMISSIONS.some((permission) => can(context, permission))

export const Route = createFileRoute('/_authenticated/_admin')({
  beforeLoad: ({ context }) => {
    if (!hasAdminSettingsAccess(deriveContext(context.authState.user))) {
      throw redirect({
        to: '/',
      })
    }
  },
  shouldReload({ context }) {
    return !hasAdminSettingsAccess(deriveContext(context.authState.user))
  },
  component: () => <Outlet />,
})

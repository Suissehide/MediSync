import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { can } from '../../hooks/useCan.ts'
import { deriveContext } from '../../store/useAuthStore.ts'

export const Route = createFileRoute('/_authenticated/_admin')({
  beforeLoad: ({ context }) => {
    if (!can(deriveContext(context.authState.user), 'planning:write')) {
      throw redirect({
        to: '/',
      })
    }
  },
  shouldReload({ context }) {
    return !can(deriveContext(context.authState.user), 'planning:write')
  },
  component: () => <Outlet />,
})

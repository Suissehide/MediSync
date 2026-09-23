import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { deriveContext } from '../store/useAuthStore.ts'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: '/auth',
        search: {
          redirect: location.href,
        },
      })
    }

    if (deriveContext(context.authState.user) === null) {
      throw redirect({
        to: '/pending',
      })
    }
  },
  shouldReload({ context }) {
    return (
      !context.authState.isAuthenticated ||
      deriveContext(context.authState.user) === null
    )
  },
  component: () => <Outlet />,
})

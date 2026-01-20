import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/_admin')({
  beforeLoad: ({ context }) => {
    if (context.authState.user?.role !== 'ADMIN') {
      throw redirect({
        to: '/',
      })
    }
  },
  shouldReload({ context }) {
    return context.authState.user?.role !== 'ADMIN'
  },
  component: () => <Outlet />,
})

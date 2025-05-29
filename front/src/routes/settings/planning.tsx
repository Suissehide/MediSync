import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../../components/dashboard.layout.tsx'

export const Route = createFileRoute('/settings/planning')({
  beforeLoad: ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  shouldReload({ context }) {
    return !context.authState.isAuthenticated
  },
  component: Planning,
})

function Planning() {
  return (
    <DashboardLayout>
      <div>Hello "/planning"!</div>
    </DashboardLayout>
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../components/dashboard.layout'

export const Route = createFileRoute('/settings')({
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
  component: Settings,
})

function Settings() {
  return (
    <DashboardLayout>
      <div>Hello "/setting"!</div>
    </DashboardLayout>
  )
}

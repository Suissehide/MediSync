import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../../components/dashboard.layout.tsx'

export const Route = createFileRoute('/settings/soignant')({
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
  component: Soignant,
})

function Soignant() {
  return (
    <DashboardLayout>
      <div>Hello "/soignant"!</div>
    </DashboardLayout>
  )
}

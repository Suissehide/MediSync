import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../components/dashboard.layout.tsx'

export const Route = createFileRoute('/patient')({
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
  component: Patient,
})

function Patient() {
  return (
    <DashboardLayout>
      <div>Hello "/patient"!</div>
    </DashboardLayout>
  )
}

export default Patient

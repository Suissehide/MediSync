import { createFileRoute } from '@tanstack/react-router'

import DashboardLayout from '../../../../components/dashboard.layout.tsx'

export const Route = createFileRoute('/_authenticated/_admin/settings/soignant')({
  component: Soignant,
})

function Soignant() {
  return (
    <DashboardLayout>
      <div>Hello "/soignant"!</div>
    </DashboardLayout>
  )
}

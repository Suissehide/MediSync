import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../components/dashboard.layout.tsx'
import ReactTable from '../components/table/reactTable.tsx'
import { getPatientColumns } from '../columns/patient.column.tsx'
import { usePatientQueries } from '../queries/usePatient.ts'

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
  component: PatientList,
})

function PatientList() {
  const { patients } = usePatientQueries()
  const columns = getPatientColumns()

  return (
    <DashboardLayout>
      <div>
        <ReactTable
          data={patients ?? []}
          columns={columns}
          filterId="patient"
          title={'Liste des patients'}
        />
      </div>
    </DashboardLayout>
  )
}

export default PatientList

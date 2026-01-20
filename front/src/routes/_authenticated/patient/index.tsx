import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { getPatientColumns } from '../../../columns/patient.column.tsx'
import DashboardLayout from '../../../components/dashboard.layout.tsx'
import ReactTable from '../../../components/table/reactTable.tsx'
import { usePatientQueries } from '../../../queries/usePatient.ts'
import type { Patient } from '../../../types/patient.ts'

export const Route = createFileRoute('/_authenticated/patient/')({
  component: PatientList,
})

function PatientList() {
  const navigate = useNavigate()
  const { patients } = usePatientQueries()

  const handleRedirectPatient = async (patientID: string) => {
    await navigate({ to: '/patient/$patientID', params: { patientID } })
  }

  const columns = getPatientColumns({
    onView: handleRedirectPatient,
  })

  return (
    <DashboardLayout components={['patient']}>
      <h2 className="mt-2 flex gap-2 items-center px-4 mb-4 text-text text-xl font-semibold">
        Liste des patients
      </h2>

      <div>
        <ReactTable<Patient>
          data={patients ?? []}
          columns={columns}
          filterId="patient"
        />
      </div>
    </DashboardLayout>
  )
}

export default PatientList

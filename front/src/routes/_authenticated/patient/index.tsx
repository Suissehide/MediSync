import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getPatientColumns } from '../../../columns/patient.column.tsx'
import AddPatientForm from '../../../components/custom/popup/addPatientForm.tsx'
import DashboardLayout from '../../../components/dashboard.layout.tsx'
import ReactTable from '../../../components/table/reactTable.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { usePatientQueries } from '../../../queries/usePatient.ts'
import type { Patient } from '../../../types/patient.ts'

export const Route = createFileRoute('/_authenticated/patient/')({
  component: PatientList,
})

function PatientList() {
  const navigate = useNavigate()
  const { patients } = usePatientQueries()
  const [searchTerm, setSearchTerm] = useState('')

  const handleRedirectPatient = async (patientID: string) => {
    await navigate({ to: '/patient/$patientID', params: { patientID } })
  }

  const columns = getPatientColumns({
    onView: handleRedirectPatient,
  })

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) {
      return patients ?? []
    }
    const term = searchTerm.toLowerCase()
    return (patients ?? []).filter(
      (p) =>
        p.firstName?.toLowerCase().includes(term) ||
        p.lastName?.toLowerCase().includes(term),
    )
  }, [patients, searchTerm])

  return (
    <DashboardLayout quickActions={[<AddPatientForm key="add-patient" />]}>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: '/dashboard' })}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-text-foreground text-xl font-semibold">
            Liste des patients
          </h2>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="patient-search" className="text-xs text-text-light">
              Rechercher un patient
            </label>
            <Input
              id="patient-search"
              iconLeft={<Search className="w-4 h-4" />}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom, prénom..."
              className="w-72"
            />
          </div>

          <Button variant="outline" size="default">
            <Download className="w-4 h-4" />
            Exporter les données
          </Button>
        </div>

        <div className="flex-1 flex flex-col">
          <ReactTable<Patient>
            data={filteredPatients}
            columns={columns}
            filterId="patient"
            onRowClick={(patient) => handleRedirectPatient(patient.id)}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

export default PatientList

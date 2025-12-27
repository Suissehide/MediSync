import { usePatientMutations } from '../../../queries/usePatient.ts'
import type { CreatePatientParams } from '../../../types/patient.ts'
import AddPatientForm from '../popup/addPatientForm.tsx'

function SidebarPatient() {
  const { createPatient } = usePatientMutations()

  const handleCreatePatient = (newPatient: CreatePatientParams) => {
    createPatient.mutate(newPatient)
  }

  return (
    <div className="flex items-center mb-6 pl-2">
      <AddPatientForm handleCreatePatient={handleCreatePatient} />
    </div>
  )
}

export default SidebarPatient

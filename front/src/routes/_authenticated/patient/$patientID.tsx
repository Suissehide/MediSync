import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, FileDown, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import EditPatient from '../../../components/custom/Patient/edit/edit.patient.tsx'
import ProgrammePDFModal from '../../../components/custom/Patient/pdf/programme-pdf-modal.tsx'
import DiagnosticPatient from '../../../components/custom/Patient/view/diagnostic.patient.tsx'
import OverviewPatient from '../../../components/custom/Patient/view/overview.patient.tsx'
import PlanningPatient from '../../../components/custom/Patient/view/planning.patient.tsx'
import AddPatientForm from '../../../components/custom/popup/addPatientForm.tsx'
import { AddPatientToPathwayForm } from '../../../components/custom/popup/addPatientToPathwayForm.tsx'
import { ConfirmDeleteForm } from '../../../components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '../../../components/dashboard.layout.tsx'
import { Button } from '../../../components/ui/button.tsx'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs.tsx'
import {
  usePatientByIDQuery,
  usePatientMutations,
} from '../../../queries/usePatient.ts'
import { useDiagnosticStore } from '../../../store/useDiagnosticStore.ts'

export const Route = createFileRoute('/_authenticated/patient/$patientID')({
  component: PatientDetails,
})

function PatientDetails() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string>('overview')
  const [showPDF, setShowPDF] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const { deletePatient } = usePatientMutations()

  const { selectedId: diagnosticSelectedId, setSelectedId } =
    useDiagnosticStore()

  const { patientID } = useParams({
    from: '/_authenticated/patient/$patientID',
  })
  const { patient, isError, isFetched } = usePatientByIDQuery(patientID)

  useEffect(() => {
    if (diagnosticSelectedId) {
      setSelected('diagnostic')
    }
  }, [diagnosticSelectedId])

  useEffect(() => {
    return () => {
      setSelectedId(null)
    }
  }, [setSelectedId])

  if (isFetched && (isError || !patient)) {
    void navigate({ to: '/patient' })
    return null
  }

  return (
    <DashboardLayout
      components={['diagnostic']}
      quickActions={[<AddPatientForm key="add-patient" />]}
    >
      <div className="flex-1 bg-background p-2 rounded flex flex-col w-full">
        <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4 min-h-0">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate({ to: '/patient' })}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-text-foreground text-xl font-semibold">
              {patient?.firstName} {patient?.lastName}
            </h2>
            <div className="ml-auto flex items-center gap-2">
              {patient && <AddPatientToPathwayForm patient={patient} />}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPDF(true)}
              >
                <FileDown className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>

          <Tabs
            value={selected}
            onValueChange={setSelected}
            className="flex-1 flex flex-col gap-4 min-h-0"
          >
            <TabsList>
              <TabsTrigger value="overview">Aperçu général</TabsTrigger>
              <TabsTrigger value="information">Informations</TabsTrigger>
              <TabsTrigger value="planning">Planning</TabsTrigger>
              <TabsTrigger value="diagnostic">Diagnostic éducatif</TabsTrigger>
            </TabsList>

            {patient && (
              <>
                <TabsContent value="overview">
                  <OverviewPatient patient={patient} />
                </TabsContent>
                <TabsContent value="information" forceMount>
                  <EditPatient patient={patient} />
                </TabsContent>
                <TabsContent value="planning">
                  <PlanningPatient patient={patient} />
                </TabsContent>
                <TabsContent value="diagnostic">
                  <DiagnosticPatient patient={patient} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </div>

      <ConfirmDeleteForm
        open={showDelete}
        setOpen={setShowDelete}
        title="Supprimer le patient"
        description={`Voulez-vous vraiment supprimer ${patient?.firstName} ${patient?.lastName} ? Cette action est irréversible.`}
        loading={deletePatient.isPending}
        onConfirm={() => {
          if (!patient) {
            return
          }
          deletePatient.mutate(patient.id, {
            onSuccess: () => void navigate({ to: '/patient' }),
          })
        }}
      />
      {showPDF && patient && (
        <ProgrammePDFModal
          patient={patient}
          onClose={() => setShowPDF(false)}
        />
      )}
    </DashboardLayout>
  )
}

export default PatientDetails

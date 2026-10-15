import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Ellipsis, FileDown, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import EditPatient from '@/components/custom/Patient/edit/edit.patient.tsx'
import { PatientAccessLogButton } from '@/components/custom/Patient/patientAccessLogButton.tsx'
import ProgrammePDFModal from '@/components/custom/Patient/pdf/programme-pdf-modal.tsx'
import DiagnosticPatient from '@/components/custom/Patient/view/diagnostic.patient.tsx'
import OverviewPatient from '@/components/custom/Patient/view/overview.patient.tsx'
import PlanningPatient from '@/components/custom/Patient/view/planning.patient.tsx'
import AddPatientForm from '@/components/custom/popup/addPatientForm.tsx'
import { AddPatientToPathwayForm } from '@/components/custom/popup/addPatientToPathwayForm.tsx'
import AddPatientToSlotForm from '@/components/custom/popup/addPatientToSlotForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverSeparator,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs.tsx'
import { useCan } from '@/hooks/useCan.ts'
import { splitPatientSlots } from '@/libs/slotAvailability.ts'
import {
  usePatientByIDQuery,
  usePatientMutations,
  usePatientPathwaysQuery,
} from '@/queries/usePatient.tsx'
import { usePatientSlotsQuery } from '@/queries/useSlot.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'

// CE FICHIER A ÉTÉ DÉPLACÉ (`$patientID.tsx` → `$patientID/index.tsx`),
// PAS SEULEMENT RENOMMÉ :
// `patient/$patientID/acces.tsx` (nouveau) et `$patientID.tsx` (l'ancien
// fichier) auraient sinon partagé le MÊME segment de route sous TanStack Router — le premier
// devenant, de fait, le PARENT du second. Or `PatientDetails` ne rend jamais `<Outlet/>` : sans
// ce déplacement, `/patient/$patientID/acces` aurait matché les deux routes, rendu SEULEMENT
// `PatientDetails` (rien n'appelle `Outlet` pour afficher l'enfant), et le nouvel écran ne se
// serait jamais affiché — ni erreur au démarrage, ni test existant pour le signaler. Vérifié en
// lisant `MatchInner` (node_modules/@tanstack/react-router/dist/esm/Match.js) : un match dont la
// route déclare un `component` rend CE component, jamais un `<Outlet/>` implicite. La forme
// retenue reprend celle, déjà éprouvée dans ce même dossier, de `patient/index.tsx` +
// `patient/$patientID.tsx` : deux fichiers frères, sans fichier de layout intermédiaire — ici un
// niveau plus bas (`$patientID/index.tsx` + `$patientID/acces.tsx`), pour la même raison. Le
// chemin public ne change pas (`fullPath` reste `/patient/$patientID`, comme pour
// `patient/index.tsx` face à `patient/`) ; seul l'identifiant interne de route gagne un `/` final
// (voir `createFileRoute` et `useParams` ci-dessous), et aucun autre fichier du dépôt ne le
// référence (vérifié par recherche).
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/patient/$patientID/',
)({
  component: PatientDetails,
})

function PatientDetails() {
  const navigate = useNavigate()
  // `pdf:export` n'a aucune route back : c'est une action purement front
  // (export généré dans le navigateur), gardée ici, seul endroit où elle
  // s'utilise.
  const canExportPdf = useCan('pdf:export')
  const canReadAccessLog = useCan('consultations:read')
  const [selected, setSelected] = useState<string>('overview')
  const [showPDF, setShowPDF] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const { deletePatient, isDeletePending } = usePatientMutations()

  const { selectedId: diagnosticSelectedId, setSelectedId } =
    useDiagnosticStore()

  const { establishmentId, serviceId, patientID } = useParams({
    from: '/_authenticated/e/$establishmentId/s/$serviceId/patient/$patientID/',
  })
  const { patient, isError, isFetched } = usePatientByIDQuery(patientID)

  // Résumé sous le nom. Les deux lectures sont déjà en cache : l'aperçu les monte avec les mêmes
  // clés, et le découpage à venir/passés est la fonction qu'il utilise lui-même.
  const { slots } = usePatientSlotsQuery(patientID)
  const { pathways = [] } = usePatientPathwaysQuery(patientID)
  const aVenir = useMemo(
    () => splitPatientSlots(slots, patientID).upcoming.length,
    [slots, patientID],
  )

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
    void navigate({
      to: '/e/$establishmentId/s/$serviceId/patient',
      params: { establishmentId, serviceId },
    })
    return null
  }

  return (
    <DashboardLayout
      components={['diagnostic']}
      quickActions={[
        <AddPatientForm key="add-patient" />,
        <AddPatientToSlotForm
          key="add-patient-to-slot"
          patientID={patientID}
        />,
      ]}
    >
      <div className="flex-1 bg-background p-2 rounded flex flex-col w-full">
        <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4 min-h-0">
          {/* `flex-wrap` : sans lui, le bloc titre est le SEUL element flexible de la ligne,
              donc il se reduit jusqu'a DISPARAITRE avant que les boutons ne cedent un pixel.
              Mesure avant correction : a 700 px de carte le nom etait deja tronque, a 560 le
              bloc titre valait zero (nom du patient invisible), et en dessous les boutons
              eux-memes s'ecrasaient. Les boutons passent desormais a la ligne. */}
          <div className="flex flex-wrap items-center gap-3.5">
            <Button
              variant="outline"
              size="icon"
              className="size-10 flex-shrink-0"
              aria-label="Retour à la liste des patients"
              onClick={() =>
                navigate({
                  to: '/e/$establishmentId/s/$serviceId/patient',
                  params: { establishmentId, serviceId },
                })
              }
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            {/* `min-w-48` et non `min-w-0` : le nom garde une largeur lisible, et c'est ce
                plancher qui declenche le passage a la ligne des boutons. */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-48">
              <h2 className="text-foreground text-2xl font-bold truncate">
                <span className="uppercase">{patient?.lastName}</span>{' '}
                {patient?.firstName}
              </h2>
              <span className="text-sm text-text-light">
                {pathways.length} parcours en cours · {aVenir} rendez-vous à
                venir
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {canExportPdf && (
                <Button
                  variant="outline"
                  size="default"
                  className="font-normal leading-tight"
                  onClick={() => setShowPDF(true)}
                >
                  <FileDown className="w-4 h-4" />
                  Générer le programme
                </Button>
              )}
              {patient && <AddPatientToPathwayForm patient={patient} />}
              <PopoverRoot>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Plus d'actions"
                  >
                    <Ellipsis className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[250px]">
                  <PatientAccessLogButton
                    establishmentId={establishmentId}
                    serviceId={serviceId}
                    patientID={patientID}
                  />
                  {canReadAccessLog && <PopoverSeparator />}
                  <PopoverMenuItem
                    variant="destructive"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setShowDelete(true)}
                  >
                    Supprimer le patient
                  </PopoverMenuItem>
                </PopoverContent>
              </PopoverRoot>
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
                  <OverviewPatient
                    patient={patient}
                    onOpenPlanning={() => setSelected('planning')}
                  />
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
        description={`Voulez-vous vraiment supprimer ${patient?.lastName} ${patient?.firstName} ? Cette action est irréversible.`}
        loading={isDeletePending}
        onConfirm={() => {
          if (!patient) {
            return
          }
          deletePatient(patient.id, {
            onOptimisticDelete: () => {
              setShowDelete(false)
              void navigate({
                to: '/e/$establishmentId/s/$serviceId/patient',
                params: { establishmentId, serviceId },
              })
            },
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

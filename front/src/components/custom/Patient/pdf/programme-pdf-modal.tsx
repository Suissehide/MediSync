import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import { Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useForbiddenWeekQueries } from '../../../../queries/useForbiddenWeek.ts'
import { usePatientPathwaysQuery } from '../../../../queries/usePatient.tsx'
import { usePdfDesignQueries } from '../../../../queries/usePdfDesign.ts'
import { usePatientSlotsQuery } from '../../../../queries/useSlot.ts'
import { useThematicQueries } from '../../../../queries/useThematic.ts'
import { useAuthStore } from '../../../../store/useAuthStore.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { PdfDesignSummary } from '../../../../types/pdfDesignList.ts'
import { Button } from '../../../ui/button.tsx'
import ProgrammePDF from './programme.pdf.tsx'

// Le choix explicite, sinon le design par defaut du service, sinon le premier disponible —
// et les presets viennent apres les designs, donc « le premier disponible » est un preset des
// que le service n'a plus de design a lui. C'est ce qui fait qu'un service dont le design par
// defaut vient d'etre supprime continue de produire un PDF au lieu d'afficher « aucun design ».
// Exporte pour etre tenu par un test : ce repli est le Review Focus 3 de l'etape 2, et il ne
// se prouve pas depuis le back, qui ne sait rien de l'ordre de cette liste.
export const chooseDesign = (
  disponibles: PdfDesignSummary[],
  choisiId: string | null,
): PdfDesignSummary | undefined =>
  disponibles.find((design) => design.id === choisiId) ??
  disponibles.find((design) => design.isDefault) ??
  disponibles[0]

interface ProgrammePDFModalProps {
  patient: Patient
  onClose: () => void
  previewMode?: boolean // true = affiche le viewer, false = télécharge directement
}

export default function ProgrammePDFModal({
  patient,
  onClose,
  previewMode = true,
}: ProgrammePDFModalProps) {
  const { slots } = usePatientSlotsQuery(patient?.id)
  const { pathways = [] } = usePatientPathwaysQuery(patient.id)
  const { forbiddenWeeks } = useForbiddenWeekQueries()
  const { thematics } = useThematicQueries()
  const { presets, designs } = usePdfDesignQueries()

  // Le nom du service vient du contexte de tenant, pose par le layout de route.
  const serviceName = useAuthStore((state) => state.context?.serviceName) ?? ''

  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null)

  // Ceux du service d'abord, puis les presets.
  const availableDesigns = useMemo<PdfDesignSummary[]>(
    () => [...designs, ...presets],
    [designs, presets],
  )

  const selectedDesign = useMemo(
    () => chooseDesign(availableDesigns, selectedDesignId),
    [availableDesigns, selectedDesignId],
  )

  const patientSlots = useMemo(() => {
    if (!slots || !patient) {
      return []
    }

    const now = dayjs()
    const filtered = slots.filter((slot) =>
      slot.appointments?.some((appointment) =>
        appointment.appointmentPatients?.some(
          (ap) => ap.patient.id === patient.id,
        ),
      ),
    )

    return filtered
      .filter((s) => dayjs(s.startDate).isAfter(now))
      .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)))
  }, [slots, patient])

  // Les semaines interdites signalent les fermetures du service entre deux
  // semaines du programme.
  const forbiddenWeekStarts = useMemo(
    () => (forbiddenWeeks ?? []).map((week) => week.startOfWeek),
    [forbiddenWeeks],
  )

  // Les thematiques sans consigne n'entrent pas dans la map : le calendrier
  // n'a ainsi qu'un seul cas a tester par creneau.
  const noticeByThematicId = useMemo(() => {
    const entries = (thematics ?? [])
      .filter((thematic) => thematic.pdfNotice?.trim())
      .map(
        (thematic) => [thematic.id, thematic.pdfNotice?.trim() ?? ''] as const,
      )
    return new Map(entries)
  }, [thematics])

  const fileName = `programme-${patient.lastName}-${patient.firstName}-${dayjs.utc().format('YYYY-MM-DD')}.pdf`

  const pdfDocument = useMemo(
    () =>
      selectedDesign ? (
        <ProgrammePDF
          patient={patient}
          upcomingSlots={patientSlots}
          pathways={pathways}
          design={selectedDesign.content}
          serviceName={serviceName}
          forbiddenWeekStarts={forbiddenWeekStarts}
          noticeByThematicId={noticeByThematicId}
        />
      ) : null,
    [
      patient,
      patientSlots,
      pathways,
      selectedDesign,
      serviceName,
      forbiddenWeekStarts,
      noticeByThematicId,
    ],
  )

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">
            Aperçu du programme - {patient.lastName} {patient.firstName}
          </h2>
          <div className="flex items-center gap-4">
            {availableDesigns.length > 1 && (
              <select
                className="border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground"
                value={selectedDesign?.id ?? ''}
                onChange={(event) => setSelectedDesignId(event.target.value)}
                aria-label="Design du document"
              >
                {availableDesigns.map((design) => (
                  <option key={design.id} value={design.id}>
                    {design.name}
                  </option>
                ))}
              </select>
            )}
            {pdfDocument && (
              <PDFDownloadLink document={pdfDocument} fileName={fileName}>
                {({ loading }) => (
                  <Button variant="default" size="default" disabled={loading}>
                    <Download className="h-4 w-4" />
                    {loading ? 'Génération...' : 'Télécharger'}
                  </Button>
                )}
              </PDFDownloadLink>
            )}
            <Button variant="outline" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Viewer */}
        {previewMode && (
          <div className="flex-1 overflow-hidden">
            {pdfDocument ? (
              <PDFViewer width="100%" height="100%" showToolbar={false}>
                {pdfDocument}
              </PDFViewer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Aucun design de document disponible pour ce service.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

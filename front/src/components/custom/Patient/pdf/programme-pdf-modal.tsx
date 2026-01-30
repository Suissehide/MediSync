import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import { Download, X } from 'lucide-react'
import { useMemo } from 'react'

import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import type { Patient } from '../../../../types/patient.ts'
import { Button } from '../../../ui/button.tsx'
import ProgrammePDF from './programme.pdf.tsx'

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
  const { slots } = useAllSlotsQuery()

  const patientSlots = useMemo(() => {
    if (!slots || !patient) {
      return { upcoming: [], past: [] }
    }

    const now = dayjs()
    const filtered = slots.filter((slot) =>
      slot.appointments?.some((appointment) =>
        appointment.appointmentPatients?.some(
          (ap) => ap.patient.id === patient.id,
        ),
      ),
    )

    const upcoming = filtered
      .filter((s) => dayjs(s.startDate).isAfter(now))
      .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)))

    const past = filtered
      .filter((s) => dayjs(s.startDate).isBefore(now))
      .sort((a, b) => dayjs(b.startDate).diff(dayjs(a.startDate)))

    return { upcoming, past }
  }, [slots, patient])

  const fileName = `programme-${patient.lastName}-${patient.firstName}-${dayjs().format('YYYY-MM-DD')}.pdf`

  const pdfDocument = (
    <ProgrammePDF
      patient={patient}
      upcomingSlots={patientSlots.upcoming}
      pastSlots={patientSlots.past}
    />
  )

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">
            Aperçu du programme - {patient.firstName} {patient.lastName}
          </h2>
          <div className="flex items-center gap-2">
            <PDFDownloadLink document={pdfDocument} fileName={fileName}>
              {({ loading }) => (
                <Button variant="default" size="default" disabled={loading}>
                  <Download className="h-4 w-4" />
                  {loading ? 'Génération...' : 'Télécharger'}
                </Button>
              )}
            </PDFDownloadLink>
            <Button variant="outline" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Viewer */}
        {previewMode && (
          <div className="flex-1 overflow-hidden">
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              {pdfDocument}
            </PDFViewer>
          </div>
        )}
      </div>
    </div>
  )
}

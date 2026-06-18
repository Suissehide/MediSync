import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import { Download, FilePlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { usePatientPathwaysQuery } from '../../../../queries/usePatient.tsx'
import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import type { Patient } from '../../../../types/patient.ts'
import { Button } from '../../../ui/button.tsx'
import DropdownFilter from '../../../ui/dropdownFilter.tsx'
import {
  getDefaultEnabledOptionalPageIds,
  OPTIONAL_PAGES,
} from './optional-pages.ts'
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
  const { pathways = [] } = usePatientPathwaysQuery(patient.id)

  const [enabledOptionalPageIds, setEnabledOptionalPageIds] = useState<
    string[]
  >(() => getDefaultEnabledOptionalPageIds())

  const handleOptionalPageChange = (id: string, checked: boolean) => {
    setEnabledOptionalPageIds((prev) =>
      checked
        ? prev.includes(id)
          ? prev
          : [...prev, id]
        : prev.filter((existingId) => existingId !== id),
    )
  }

  const optionalPageFilters = useMemo(
    () =>
      OPTIONAL_PAGES.map((page) => ({
        id: page.id,
        label: page.label,
        checked: enabledOptionalPageIds.includes(page.id),
      })),
    [enabledOptionalPageIds],
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

  const fileName = `programme-${patient.lastName}-${patient.firstName}-${dayjs.utc().format('YYYY-MM-DD')}.pdf`

  const pdfDocument = useMemo(
    () => (
      <ProgrammePDF
        patient={patient}
        upcomingSlots={patientSlots}
        pathways={pathways}
        enabledOptionalPageIds={enabledOptionalPageIds}
      />
    ),
    [patient, patientSlots, pathways, enabledOptionalPageIds],
  )

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">
            Aperçu du programme - {patient.firstName} {patient.lastName}
          </h2>
          <div className="flex items-center gap-4">
            {OPTIONAL_PAGES.length > 0 && (
              <DropdownFilter
                filters={optionalPageFilters}
                onFilterChange={handleOptionalPageChange}
                triggerLabel="Pages additionnelles"
                TriggerIcon={FilePlus}
              />
            )}
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

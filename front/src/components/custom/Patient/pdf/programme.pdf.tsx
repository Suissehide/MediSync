import { Document } from '@react-pdf/renderer'

import type { Patient, PatientPathway } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import CalendarPages from './pages/calendar-pages.pdf.tsx'
import CoverPage from './pages/cover-page.pdf.tsx'
import TipsPage from './pages/tips-page.pdf.tsx'

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  pathways: PatientPathway[]
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  pathways,
}: ProgrammePDFProps) {
  return (
    <Document>
      <CoverPage
        patient={patient}
        upcomingSlots={upcomingSlots}
        pathways={pathways}
      />
      <CalendarPages upcomingSlots={upcomingSlots} />
      <TipsPage />
    </Document>
  )
}

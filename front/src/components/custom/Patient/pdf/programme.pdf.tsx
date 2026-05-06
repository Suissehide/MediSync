import { Document } from '@react-pdf/renderer'

import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import CalendarPages from './pages/calendar-pages.pdf.tsx'
import CoverPage from './pages/cover-page.pdf.tsx'
import TipsPage from './pages/tips-page.pdf.tsx'

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
}

export default function ProgrammePDF({ patient, upcomingSlots }: ProgrammePDFProps) {
  return (
    <Document>
      <CoverPage patient={patient} upcomingSlots={upcomingSlots} />
      <CalendarPages upcomingSlots={upcomingSlots} />
      <TipsPage />
    </Document>
  )
}

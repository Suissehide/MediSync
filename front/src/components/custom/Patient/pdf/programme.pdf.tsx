import { Document } from '@react-pdf/renderer'

import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import { OPTIONAL_PAGES } from './optional-pages.ts'
import CalendarPages from './pages/calendar-pages.pdf.tsx'
import CoverPage from './pages/cover-page.pdf.tsx'
import TipsPage from './pages/tips-page.pdf.tsx'

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  enabledOptionalPageIds: string[]
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  enabledOptionalPageIds,
}: ProgrammePDFProps) {
  const optionalPages = OPTIONAL_PAGES.filter((p) =>
    enabledOptionalPageIds.includes(p.id),
  )

  return (
    <Document>
      <CoverPage patient={patient} upcomingSlots={upcomingSlots} />
      <CalendarPages upcomingSlots={upcomingSlots} />
      <TipsPage />
      {optionalPages.map((p) => (
        <p.Component
          key={p.id}
          patient={patient}
          upcomingSlots={upcomingSlots}
        />
      ))}
    </Document>
  )
}

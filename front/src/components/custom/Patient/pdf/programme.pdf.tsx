import { Document } from '@react-pdf/renderer'

import type { Patient, PatientPathway } from '../../../../types/patient.ts'
import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'
import type { Slot } from '../../../../types/slot.ts'
import { pagesOf } from '../../pdf-design/render-pdf.tsx'

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  pathways: PatientPathway[]
  design: PdfDesignContent
  serviceName: string
  forbiddenWeekStarts: string[]
  noticeByThematicId: Map<string, string>
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  pathways,
  design,
  serviceName,
  forbiddenWeekStarts,
  noticeByThematicId,
}: ProgrammePDFProps) {
  return (
    <Document>
      {pagesOf(
        design,
        { patient, pathways, upcomingSlots, serviceName },
        {
          upcomingSlots,
          patientId: patient.id,
          forbiddenWeekStarts,
          noticeByThematicId,
        },
      )}
    </Document>
  )
}

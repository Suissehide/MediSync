import { Document } from '@react-pdf/renderer'

import type { Patient, PatientPathway } from '../../../../types/patient.ts'
import type { SourcesImages } from '../../../../types/pdfAsset.ts'
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
  // Les octets des images deposees que ce design reclame. Sans eux, une image deposee ne sort
  // pas du PDF du patient — alors qu'elle s'affiche dans l'editeur.
  sources?: SourcesImages
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  pathways,
  design,
  serviceName,
  forbiddenWeekStarts,
  noticeByThematicId,
  sources,
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
        sources,
      )}
    </Document>
  )
}

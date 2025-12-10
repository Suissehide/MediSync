import dayjs from 'dayjs'

import {
  CARE_MODE,
  ETP_DECISION,
  MEDICAL_DIAGNOSIS,
  NON_INCLUSION_DETAILS,
  ORIENTATION,
  PROGRAM_TYPE,
} from '../../../../constants/patient.constant.ts'
import { getLabel } from '../../../../libs/utils.ts'
import type { Patient } from '../../../../types/patient.ts'

interface PathwayInclusionPatientProps {
  patient?: Patient
}

export default function PathwayInclusionPatient({
  patient,
}: PathwayInclusionPatientProps) {
  return (
    <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
      <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
        <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
          Parcours et inclusion
        </span>
      </h4>
      <div className="mt-3">
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Diagnostic médical</div>
          <div>{getLabel(MEDICAL_DIAGNOSIS, patient?.medicalDiagnosis)}</div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Date d'entrée</div>
          <div>
            {patient?.entryDate
              ? dayjs(patient.entryDate).format('DD/MM/YYYY')
              : '-'}
          </div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Mode de prise en charge</div>
          <div>{getLabel(CARE_MODE, patient?.careMode)}</div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Orientation</div>
          <div>{getLabel(ORIENTATION, patient?.orientation)}</div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">ETP décision</div>
          <div>{getLabel(ETP_DECISION, patient?.etpDecision)}</div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Type de programme</div>
          <div>{getLabel(PROGRAM_TYPE, patient?.programType)}</div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Précision non inclusion</div>
          <div>
            {getLabel(NON_INCLUSION_DETAILS, patient?.nonInclusionDetails)}
          </div>
        </div>
        <div className="mb-2">
          <div className="text-sm text-text-light">
            Précision contenu personnalisé
          </div>
          <div>{patient?.customContentDetails || '-'}</div>
        </div>
        <div className="mb-2">
          <div className="text-sm text-text-light">Objectif</div>
          <div>{patient?.goal || '-'}</div>
        </div>
      </div>
    </div>
  )
}

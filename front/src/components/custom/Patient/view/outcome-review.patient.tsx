import dayjs from 'dayjs'

import {
  ETP_FINAL_OUTCOME,
  STOP_REASON,
} from '../../../../constants/patient.constant.ts'
import { getLabel } from '../../../../libs/utils.ts'
import type { Patient } from '../../../../types/patient.ts'

interface OutcomeReviewPatientProps {
  patient?: Patient
}

export default function OutcomeReviewPatient({
  patient,
}: OutcomeReviewPatientProps) {
  return (
    <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
      <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
        <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
          Sortie et bilan
        </span>
      </h4>
      <div className="mt-3">
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">Date de sortie</div>
          <div>
            {patient?.exitDate
              ? dayjs(patient.exitDate).format('DD/MM/YYYY')
              : '-'}
          </div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">
            {' '}
            Motif d’arrêt de programme
          </div>
          <div>{getLabel(STOP_REASON, patient?.stopReason)}</div>
        </div>
        <div className="flex justify-between items-center gap-4">
          <div className="text-sm text-text-light">
            Point final parcours ETP
          </div>
          <div>{getLabel(ETP_FINAL_OUTCOME, patient?.etpFinalOutcome)}</div>
        </div>
      </div>
    </div>
  )
}

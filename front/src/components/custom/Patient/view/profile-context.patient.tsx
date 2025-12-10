import {
  CURRENT_ACTIVITY,
  DISTANCE,
  EDUCATION_LEVEL,
  OCCUPATION,
} from '../../../../constants/patient.constant.ts'
import { getLabel } from '../../../../libs/utils.ts'
import type { Patient } from '../../../../types/patient.ts'

interface ProfileContextPatientProps {
  patient?: Patient
}

export default function ProfileContextPatient({
  patient,
}: ProfileContextPatientProps) {
  return (
    <>
      <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
        <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
          <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
            Informations personnelles et sociales
          </span>
        </h4>
        <div className="mt-3">
          <div className="flex justify-between items-center gap-4">
            <div className="text-sm text-text-light">Distance d'habitation</div>
            <div>{getLabel(DISTANCE, patient?.distance)}</div>
          </div>
          <div className="flex justify-between items-center gap-4">
            <div className="text-sm text-text-light">Niveau d’étude</div>
            <div>{getLabel(EDUCATION_LEVEL, patient?.educationLevel)}</div>
          </div>
          <div className="flex justify-between items-center gap-4">
            <div className="text-sm text-text-light">Profession</div>
            <div>{getLabel(OCCUPATION, patient?.occupation)}</div>
          </div>
          <div className="flex justify-between items-center gap-4">
            <div className="text-sm text-text-light">Activité actuelle</div>
            <div>{getLabel(CURRENT_ACTIVITY, patient?.currentActivity)}</div>
          </div>
        </div>
      </div>

      <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
        <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
          <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
            Références et contexte
          </span>
        </h4>
        <div className="mt-3">
          <div className="mb-2">
            <div className="text-sm text-text-light">Soignant référent</div>
            <div>{patient?.referringCaregiver || '-'}</div>
          </div>
          <div className="mb-2">
            <div className="text-sm text-text-light">Suivi à régulariser</div>
            <div>{patient?.followUpToDo || '-'}</div>
          </div>
        </div>
      </div>

      <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
        <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
          <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
            Notes
          </span>
        </h4>
        <div className="mt-3">
          <div className="mb-2">
            <div className="text-sm text-text-light">Notes</div>
            <div>{patient?.notes || '-'}</div>
          </div>
          <div className="mb-2">
            <div className="text-sm text-text-light">Détails</div>
            <div>{patient?.details || '-'}</div>
          </div>
        </div>
      </div>
    </>
  )
}

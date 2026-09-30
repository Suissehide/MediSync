import { useQuery } from '@tanstack/react-query'

import { AccessLogApi } from '../api/accessLog.api.ts'
import { PATIENT_ACCESS_LOG } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'

// * QUERIES

// Journal des consultations d'un dossier, à l'échelle du SEUL service courant
// — `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. `retry: 0`, comme le
// reste du dépôt : une erreur ne doit pas rester silencieusement `isPending` (voir
// `libs/queryState.ts`, dont ce module ne sait rien — c'est l'écran appelant qui compose l'état).
export const usePatientAccessLogQuery = (patientID: string) => {
  const {
    data: entries,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PATIENT_ACCESS_LOG.GET_BY_PATIENT, patientID],
    queryFn: () => AccessLogApi.getByPatient(patientID),
    enabled: !!patientID,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { entries, isPending, error }
}

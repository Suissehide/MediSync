import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  AccessLogApi,
  type GetPatientAccessLogParams,
} from '../api/accessLog.api.ts'
import { PATIENT_ACCESS_LOG } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'

// * QUERIES

// Journal des consultations d'un dossier, à l'échelle du SEUL service courant (étape 4b, tâche
// 10) — `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. `retry: 0`, comme le
// reste du dépôt : une erreur ne doit pas rester silencieusement `isPending` (voir
// `libs/queryState.ts`, dont ce module ne sait rien — c'est l'écran appelant qui compose l'état).
export const usePatientAccessLogQuery = (
  patientID: string,
  params: GetPatientAccessLogParams = {},
) => {
  const { data, isPending, isError, error } = useQuery({
    // `params` (page, taille) fait partie de la clé, comme sur les deux autres journaux : sans lui,
    // changer de page ne changerait pas de requête.
    queryKey: [PATIENT_ACCESS_LOG.GET_BY_PATIENT, patientID, params],
    queryFn: () => AccessLogApi.getByPatient(patientID, params),
    enabled: !!patientID,
    retry: 0,
    // Changer de page garde la page précédente affichée jusqu'à l'arrivée de la suivante.
    placeholderData: keepPreviousData,
  })

  useDataFetching({ isPending, isError, error })

  return { data, isPending, error }
}

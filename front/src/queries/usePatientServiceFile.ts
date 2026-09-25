import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PatientServiceFileApi } from '../api/patientServiceFile.api.ts'
import { PATIENT_SERVICE_FILE } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import {
  restoreForTenant,
  snapshotForTenant,
} from '../hooks/useTenantSwitch.ts'
import { useToast } from '../hooks/useToast.ts'
import { isApiError } from '../libs/httpErrorHandler.ts'
import type { UpdatePatientServiceFileParams } from '../types/patientServiceFile.ts'

// * QUERIES

// Le sous-dossier peut ne pas exister : le back rend une 404 tant qu'aucune écriture ne l'a
// encore créé pour ce patient dans ce service (délibéré — un objet vide et une absence ne se
// distingueraient pas côté appelant). C'est un état normal, pas une erreur : le `queryFn`
// traduit ici cette 404 précise en `serviceFile: null`, pour que `isError` reste faux et qu'aucun
// toast d'erreur ne se déclenche via `useDataFetching`. Toute autre défaillance (403, 500,
// réseau) continue de remonter normalement. `null`, pas `undefined` : React Query refuse
// qu'un `queryFn` renvoie `undefined` (« Query data cannot be undefined »), qui signifie pour
// lui « pas de mise à jour », pas « absence ».
export const usePatientServiceFileQuery = (patientID: string) => {
  const {
    data: serviceFile,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [PATIENT_SERVICE_FILE.GET_BY_PATIENT, patientID],
    queryFn: async () => {
      try {
        return await PatientServiceFileApi.getByPatient(patientID)
      } catch (err) {
        if (isApiError(err) && err.status === 404) {
          return null
        }
        throw err
      }
    },
    enabled: !!patientID,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { serviceFile, isPending, isError, error, refetch }
}

// * MUTATIONS

export const usePatientServiceFileMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const updatePatientServiceFile = useMutation({
    mutationKey: [PATIENT_SERVICE_FILE.UPDATE],
    mutationFn: (params: UpdatePatientServiceFileParams) =>
      PatientServiceFileApi.update(params),
    onMutate: async (updated: UpdatePatientServiceFileParams) => {
      await queryClient.cancelQueries({
        queryKey: [PATIENT_SERVICE_FILE.GET_BY_PATIENT, updated.patientID],
      })

      const previousServiceFile = snapshotForTenant(queryClient, [
        PATIENT_SERVICE_FILE.GET_BY_PATIENT,
        updated.patientID,
      ])
      queryClient.setQueryData(
        [PATIENT_SERVICE_FILE.GET_BY_PATIENT, updated.patientID],
        (old: unknown) =>
          old && typeof old === 'object' ? { ...old, ...updated } : old,
      )

      return { previousServiceFile }
    },
    onSuccess: () => {
      toast({
        title: 'Dossier de service modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousServiceFile)

      toast({
        title: 'Erreur lors de la mise à jour du dossier de service',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async (_, __, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [PATIENT_SERVICE_FILE.GET_BY_PATIENT, variables.patientID],
      })
    },
  })

  return { updatePatientServiceFile }
}

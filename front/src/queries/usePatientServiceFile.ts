import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PatientServiceFileApi } from '../api/patientServiceFile.api.ts'
import { PATIENT, PATIENT_SERVICE_FILE } from '../constants/process.constant.ts'
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
      // `updated` porte `patientID` (le paramètre de
      // mutation, qui désigne le patient) en plus des champs du sous-dossier ; l'entité en cache
      // porte, elle, `patientId` (minuscule). Sans cette exclusion, `{...old, ...updated}`
      // injectait une clé `patientID` étrangère dans l'objet `PatientServiceFile` optimiste —
      // sans conséquence observable (rien ne la lit), mais l'objet cessait d'être ce qu'il
      // prétendait être.
      const { patientID: _patientID, ...updatedFields } = updated
      queryClient.setQueryData(
        [PATIENT_SERVICE_FILE.GET_BY_PATIENT, updated.patientID],
        (old: unknown) =>
          old && typeof old === 'object' ? { ...old, ...updatedFields } : old,
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

  // Rattache une identite existante (trouvee par PatientApi.searchIdentity) au service courant
  // (spec §6) : cree le sous-dossier s'il n'existe pas deja, sans jamais toucher a
  // l'identite ni au sous-dossier d'un autre service. Pas de mise a jour optimiste du cache — le
  // sous-dossier cree est vide, et le seul contenu que ce flux ecrit est "ce patient est
  // desormais suivi ici" : la liste du service courant (PATIENT.GET_ALL_WITH_TAGS) est invalidee
  // en retour, pour que le patient y apparaisse.
  const attachExistingPatient = useMutation({
    mutationKey: [PATIENT_SERVICE_FILE.ATTACH_EXISTING],
    mutationFn: (patientID: string) =>
      PatientServiceFileApi.attachExisting(patientID),
    onError: (error) => {
      toast({
        title: 'Erreur lors du rattachement du patient au service',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSuccess: async (result) => {
      // Le cas « déjà suivi ici » doit être dit clairement, sans laisser
      // croire qu'un nouveau sous-dossier vient d'être créé — d'où un message et une sévérité
      // distincts, jamais le même toast de succès que pour un vrai rattachement.
      toast(
        result.alreadyFollowedHere
          ? {
              title: 'Ce patient est déjà suivi dans ce service',
              message: "Son dossier existant n'a pas été modifié.",
              severity: TOAST_SEVERITY.INFO,
            }
          : {
              title: 'Patient rattaché à ce service',
              severity: TOAST_SEVERITY.SUCCESS,
            },
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] }),
        queryClient.invalidateQueries({
          queryKey: [PATIENT.GET_ALL_WITH_TAGS],
        }),
        queryClient.invalidateQueries({
          queryKey: [PATIENT_SERVICE_FILE.GET_BY_PATIENT, result.patientId],
        }),
      ])
    },
  })

  return { updatePatientServiceFile, attachExistingPatient }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { PatientApi } from '../api/patient.api.ts'
import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT, PATHWAY, PATIENT, SLOT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreatePatientParams,
  EnrollExistingPatientParams,
  EnrollmentResult,
  Patient,
  PatientWithTags,
  UpdatePatientParams,
} from '../types/patient.ts'

const UNDO_DELETE_DELAY = 5000

// * QUERIES

export const usePatientQueries = () => {
  const getAllPatients = async () => await PatientApi.getAll()

  const {
    data: patients,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PATIENT.GET_ALL],
    queryFn: getAllPatients,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { patients, isPending, isError, error }
}

export const usePatientByIDQuery = (patientID: string, options = {}) => {
  const {
    data: patient,
    isPending,
    isError,
    error,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: [PATIENT.GET_BY_ID, patientID],
    queryFn: () => PatientApi.getByID(patientID),
    enabled: !!patientID,
    retry: 0,
    ...options,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { patient, isPending, isError, error, refetch, isFetched }
}

export const usePatientWithTagsQuery = () => {
  const {
    data: patients,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PATIENT.GET_ALL_WITH_TAGS],
    queryFn: () => PatientApi.getAllWithTags(),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { patients, isPending }
}

// * MUTATIONS

export const usePatientMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createPatient = useMutation({
    mutationKey: [PATIENT.CREATE],
    mutationFn: PatientApi.create,
    onMutate: async (newPatient: CreatePatientParams) => {
      await queryClient.cancelQueries({ queryKey: [PATIENT.GET_ALL] })

      const previousPatients = queryClient.getQueryData([PATIENT.GET_ALL])
      queryClient.setQueryData([PATIENT.GET_ALL], (oldPatients: Patient[]) => [
        ...(oldPatients || []),
        newPatient,
      ])

      return { previousPatients }
    },
    onSuccess: () => {
      toast({
        title: 'Patient créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATIENT.GET_ALL], context?.previousPatients)

      toast({
        title: 'Erreur lors de la création du patient',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] })
    },
  })

  const [isDeletePending, setIsDeletePending] = useState(false)

  const deletePatient = useCallback(
    (
      patientID: string,
      options?: { onOptimisticDelete?: () => void },
    ) => {
      setIsDeletePending(true)

      // Snapshot the cache so we can restore on undo or on API error
      const previousPatients = queryClient.getQueryData<Patient[]>([
        PATIENT.GET_ALL,
      ])
      const previousPatientsWithTags = queryClient.getQueryData<
        PatientWithTags[]
      >([PATIENT.GET_ALL_WITH_TAGS])
      const previousPatient = queryClient.getQueryData([
        PATIENT.GET_BY_ID,
        patientID,
      ])

      // Prevent React Query from refetching (and restoring the deleted patient)
      // while the undo window is open.
      queryClient.setQueryDefaults([PATIENT.GET_ALL], {
        staleTime: UNDO_DELETE_DELAY + 1000,
      })
      queryClient.setQueryDefaults([PATIENT.GET_ALL_WITH_TAGS], {
        staleTime: UNDO_DELETE_DELAY + 1000,
      })
      void queryClient.cancelQueries({ queryKey: [PATIENT.GET_ALL] })
      void queryClient.cancelQueries({
        queryKey: [PATIENT.GET_ALL_WITH_TAGS],
      })

      // Optimistically remove from caches
      queryClient.setQueryData([PATIENT.GET_ALL], (oldPatients?: Patient[]) =>
        oldPatients?.filter((patient) => patient.id !== patientID),
      )
      queryClient.setQueryData(
        [PATIENT.GET_ALL_WITH_TAGS],
        (oldPatients?: PatientWithTags[]) =>
          oldPatients?.filter((patient) => patient.id !== patientID),
      )

      // Fire optional callback (e.g. navigate away) now that the UI has been updated
      options?.onOptimisticDelete?.()

      const restoreQueryDefaults = () => {
        queryClient.setQueryDefaults([PATIENT.GET_ALL], { staleTime: 0 })
        queryClient.setQueryDefaults([PATIENT.GET_ALL_WITH_TAGS], {
          staleTime: 0,
        })
      }

      let cancelled = false

      const timeoutId = setTimeout(async () => {
        if (cancelled) {
          return
        }
        try {
          await PatientApi.delete(patientID)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] }),
            queryClient.invalidateQueries({
              queryKey: [PATIENT.GET_ALL_WITH_TAGS],
            }),
          ])
        } catch (error) {
          // Restore on API failure
          queryClient.setQueryData([PATIENT.GET_ALL], previousPatients)
          queryClient.setQueryData(
            [PATIENT.GET_ALL_WITH_TAGS],
            previousPatientsWithTags,
          )
          queryClient.setQueryData(
            [PATIENT.GET_BY_ID, patientID],
            previousPatient,
          )
          toast({
            title: 'Erreur lors de la suppression du patient',
            message: error instanceof Error ? error.message : undefined,
            severity: TOAST_SEVERITY.ERROR,
          })
        } finally {
          restoreQueryDefaults()
          setIsDeletePending(false)
        }
      }, UNDO_DELETE_DELAY)

      const { dismiss } = toast({
        title: 'Patient supprimé',
        severity: TOAST_SEVERITY.SUCCESS,
        duration: UNDO_DELETE_DELAY,
        action: (
          <Button
            variant="none"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              cancelled = true
              clearTimeout(timeoutId)
              // Restore caches
              queryClient.setQueryData(
                [PATIENT.GET_ALL],
                previousPatients,
              )
              queryClient.setQueryData(
                [PATIENT.GET_ALL_WITH_TAGS],
                previousPatientsWithTags,
              )
              queryClient.setQueryData(
                [PATIENT.GET_BY_ID, patientID],
                previousPatient,
              )
              restoreQueryDefaults()
              setIsDeletePending(false)
              dismiss()
              toast({
                title: 'Suppression annulée',
                severity: TOAST_SEVERITY.INFO,
              })
            }}
          >
            Annuler
          </Button>
        ),
      })
    },
    [queryClient, toast],
  )

  const updatePatient = useMutation({
    mutationKey: [PATIENT.UPDATE],
    mutationFn: PatientApi.update,
    onMutate: async (updatedPatient: UpdatePatientParams) => {
      await queryClient.cancelQueries({ queryKey: [PATIENT.GET_ALL] })
      const previousPatients = queryClient.getQueryData([PATIENT.GET_ALL])
      queryClient.setQueryData([PATIENT.GET_ALL], (oldPatients: Patient[]) =>
        oldPatients?.map((patient: Patient) =>
          patient.id === updatedPatient.id ? updatedPatient : patient,
        ),
      )

      await queryClient.cancelQueries({ queryKey: [PATIENT.GET_BY_ID] })
      const previousPatient = queryClient.getQueryData([
        PATIENT.GET_BY_ID,
        updatedPatient.id,
      ])
      queryClient.setQueryData(
        [PATIENT.GET_BY_ID, updatedPatient.id],
        updatedPatient,
      )

      return { previousPatients, previousPatient }
    },
    onSuccess: () => {
      toast({
        title: 'Patient modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATIENT.GET_ALL], context?.previousPatients)
      queryClient.setQueryData([PATIENT.GET_BY_ID], context?.previousPatient)

      toast({
        title: 'Erreur lors de la mise à jour du patient',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [PATIENT.GET_BY_ID] })
    },
  })

  const enrollPatient = useMutation({
    mutationKey: [PATIENT.ENROLL],
    mutationFn: PatientApi.enroll,
    onSuccess: (data: EnrollmentResult) => {
      if (data.failedEnrollments.length > 0) {
        const issues = data.failedEnrollments
          .map(
            (f) => `${f.slotTemplate.name ?? f.slotTemplate.id}: ${f.reason}`,
          )
          .join('\n')
        toast({
          title: 'Patient inscrit avec des erreurs',
          message: issues,
          severity: TOAST_SEVERITY.WARNING,
        })
      } else {
        toast({
          title: 'Patient inscrit avec succès',
          severity: TOAST_SEVERITY.SUCCESS,
        })
      }
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'inscription du patient",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] }),
        queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] }),
        queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] }),
      ])
    },
  })

  const enrollExistingPatient = useMutation({
    mutationKey: [PATIENT.ENROLL_EXISTING],
    mutationFn: (params: EnrollExistingPatientParams) =>
      PatientApi.enrollExisting(params),
    onSuccess: (data: EnrollmentResult) => {
      if (data.failedEnrollments.length > 0) {
        const issues = data.failedEnrollments
          .map(
            (f) => `${f.slotTemplate.name ?? f.slotTemplate.id}: ${f.reason}`,
          )
          .join('\n')
        toast({
          title: 'Patient inscrit avec des erreurs',
          message: issues,
          severity: TOAST_SEVERITY.WARNING,
        })
      } else {
        toast({
          title: 'Patient inscrit avec succès',
          severity: TOAST_SEVERITY.SUCCESS,
        })
      }
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'inscription du patient",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] }),
        queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] }),
        queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] }),
        ...(data?.patient.id
          ? [
              queryClient.invalidateQueries({
                queryKey: [PATIENT.GET_BY_ID, data.patient.id],
              }),
            ]
          : []),
      ])
    },
  })

  const dismissEnrollmentIssue = useMutation({
    mutationKey: [PATIENT.DISMISS_ENROLLMENT_ISSUE],
    mutationFn: ({ patientID, issueID }: { patientID: string; issueID: string }) =>
      PatientApi.dismissEnrollmentIssue(patientID, issueID),
    onError: (error) => {
      toast({
        title: "Erreur lors de la suppression du problème d'inscription",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async (_, __, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [PATIENT.GET_BY_ID, variables.patientID],
      })
    },
  })

  const removeFromPathway = useMutation({
    mutationKey: [PATIENT.REMOVE_FROM_PATHWAY],
    mutationFn: ({
      patientID,
      pathwayID,
    }: {
      patientID: string
      pathwayID: string
    }) => PatientApi.removeFromPathway(patientID, pathwayID),
    onSuccess: () => {
      toast({
        title: 'Patient retiré du parcours',
        severity: TOAST_SEVERITY.SUCCESS,
      })
      queryClient.invalidateQueries({ queryKey: [PATIENT.GET_BY_ID] })
      queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] })
      queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL_WITH_TAGS] })
      queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
      queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
      queryClient.invalidateQueries({ queryKey: [PATHWAY.GET_TRACKING] })
    },
    onError: () => {
      toast({
        title: 'Impossible de retirer le patient du parcours',
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })

  return {
    createPatient,
    deletePatient,
    isDeletePending,
    updatePatient,
    enrollPatient,
    enrollExistingPatient,
    dismissEnrollmentIssue,
    removeFromPathway,
  }
}

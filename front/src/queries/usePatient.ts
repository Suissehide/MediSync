import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PatientApi } from '../api/patient.api.ts'
import { PATIENT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreatePatientParams,
  Patient,
  UpdatePatientParams,
} from '../types/patient.ts'

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

  const deletePatient = useMutation({
    mutationKey: [PATIENT.DELETE],
    mutationFn: PatientApi.delete,
    onMutate: async (patientID) => {
      await queryClient.cancelQueries({ queryKey: [PATIENT.GET_ALL] })

      const previousPatients = queryClient.getQueryData([PATIENT.GET_ALL])
      queryClient.setQueryData([PATIENT.GET_ALL], (oldPatients: Patient[]) =>
        oldPatients?.filter((patient: Patient) => patient.id !== patientID),
      )

      return { previousPatients }
    },
    onSuccess: () => {
      toast({
        title: 'Patient supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATIENT.GET_ALL], context?.previousPatients)

      toast({
        title: 'Erreur lors de la suppression du patient',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] })
    },
  })

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

  return { createPatient, deletePatient, updatePatient }
}

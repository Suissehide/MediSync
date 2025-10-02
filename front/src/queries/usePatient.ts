import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { PATIENT } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { PatientApi } from '../api/patient.ts'
import type {
  CreatePatientParams,
  Patient,
  UpdatePatientParams,
} from '../types/patient.ts'

// * QUERIES

export const usePatientQueries = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING
  const getAllPatients = async () => {
    return await PatientApi.getAll()
  }
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

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { patients, isPending, error }
}

// * MUTATIONS

export const usePatientMutations = () => {
  const queryClient = useQueryClient()

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
    onError: (_, __, context) => {
      queryClient.setQueryData([PATIENT.GET_ALL], context?.previousPatients)
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
    onError: (_, __, context) => {
      queryClient.setQueryData([PATIENT.GET_ALL], context?.previousPatients)
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

      return { previousPatients }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([PATIENT.GET_ALL], context?.previousPatients)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] })
    },
  })

  return { createPatient, deletePatient, updatePatient }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { APPOINTMENT } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { AppointmentApi } from '../api/appointment.ts'
import type {
  CreateAppointmentParams,
  Appointment,
  UpdateAppointmentParams,
} from '../types/appointment.ts'

// * QUERIES

export const useAllAppointmentsQuery = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING

  const {
    data: appointments,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [APPOINTMENT.GET_ALL],
    queryFn: AppointmentApi.getAll,
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

  return { appointments, isPending, isError, error }
}

export const useAppointmentByIDQuery = (
  appointmentID: string,
  options = {},
) => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING

  const {
    data: appointment,
    isPending,
    isError,
    error,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: [APPOINTMENT.GET_BY_ID, appointmentID],
    queryFn: () => AppointmentApi.getByID(appointmentID),
    enabled: !!appointmentID,
    retry: 0,
    ...options,
  })

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { appointment, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useAppointmentMutations = () => {
  const queryClient = useQueryClient()

  const createAppointment = useMutation({
    mutationKey: [APPOINTMENT.CREATE],
    mutationFn: AppointmentApi.create,
    onMutate: async (newAppointment: CreateAppointmentParams) => {
      await queryClient.cancelQueries({ queryKey: [APPOINTMENT.GET_ALL] })

      const previousAppointments = queryClient.getQueryData([
        APPOINTMENT.GET_ALL,
      ])
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        (oldAppointments: Appointment[]) => [
          ...(oldAppointments || []),
          newAppointment,
        ],
      )

      return { previousAppointments }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        context?.previousAppointments,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    },
  })

  const deleteAppointment = useMutation({
    mutationKey: [APPOINTMENT.DELETE],
    mutationFn: AppointmentApi.delete,
    onMutate: async (appointmentID) => {
      await queryClient.cancelQueries({ queryKey: [APPOINTMENT.GET_ALL] })

      const previousAppointments = queryClient.getQueryData([
        APPOINTMENT.GET_ALL,
      ])
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        (oldAppointments: Appointment[]) =>
          oldAppointments?.filter(
            (appointment: Appointment) => appointment.id !== appointmentID,
          ),
      )

      return { previousAppointments }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        context?.previousAppointments,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    },
  })

  const updateAppointment = useMutation({
    mutationKey: [APPOINTMENT.UPDATE],
    mutationFn: AppointmentApi.update,
    onMutate: async (updatedAppointment: UpdateAppointmentParams) => {
      await queryClient.cancelQueries({ queryKey: [APPOINTMENT.GET_ALL] })

      const previousAppointments = queryClient.getQueryData([
        APPOINTMENT.GET_ALL,
      ])
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        (oldAppointments: Appointment[]) =>
          oldAppointments?.map((appointment: Appointment) =>
            appointment.id === updatedAppointment.id
              ? updatedAppointment
              : appointment,
          ),
      )

      return { previousAppointments }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        context?.previousAppointments,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    },
  })

  useDataFetching({
    isPending: createAppointment.isPending,
    isError: createAppointment.isError,
    error: createAppointment.error,
    errorMessage: 'Erreur lors de la création du rendez-vous',
  })

  useDataFetching({
    isPending: updateAppointment.isPending,
    isError: updateAppointment.isError,
    error: updateAppointment.error,
    errorMessage: 'Erreur lors de la modification du rendez-vous',
  })

  useDataFetching({
    isPending: deleteAppointment.isPending,
    isError: deleteAppointment.isError,
    error: deleteAppointment.error,
    errorMessage: 'Erreur lors de la suppression du rendez-vous',
  })

  return { createAppointment, deleteAppointment, updateAppointment }
}

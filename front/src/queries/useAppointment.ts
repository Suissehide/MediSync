import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { AppointmentApi } from '../api/appointment.api.ts'
import { APPOINTMENT, SLOT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  Appointment,
  CreateAppointmentParams,
  UpdateAppointmentParams,
} from '../types/appointment.ts'

// * QUERIES

export const useAllAppointmentsQuery = () => {
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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { appointments, isPending, isError, error }
}

export const useAppointmentByIDQuery = (
  appointmentID: string,
  options = {},
) => {
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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { appointment, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useAppointmentMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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
    onSuccess: () => {
      toast({
        title: 'Rendez-vous créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        context?.previousAppointments,
      )

      toast({
        title: 'Erreur lors de la création du rendez-vous',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
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
    onSuccess: () => {
      toast({
        title: 'Rendez-vous supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        context?.previousAppointments,
      )

      toast({
        title: 'Erreur lors de la suppression du rendez-vous',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
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
    onSuccess: () => {
      toast({
        title: 'Rendez-vous modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [APPOINTMENT.GET_ALL],
        context?.previousAppointments,
      )

      toast({
        title: 'Erreur lors de la mise à jour du rendez-vous',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
    },
  })

  return { createAppointment, deleteAppointment, updateAppointment }
}

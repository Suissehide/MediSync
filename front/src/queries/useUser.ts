import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { UserApi } from '../api/user.api.ts'
import { APPOINTMENT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { UpdateUserParams, User } from '../types/auth.ts'

// * QUERIES

export const useAllUsersQuery = () => {
  const {
    data: users,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [APPOINTMENT.GET_ALL],
    queryFn: UserApi.getAll,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { users, isPending, isError, error }
}

export const useUserByIDQuery = (userID: string, options = {}) => {
  const {
    data: user,
    isPending,
    isError,
    error,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: [APPOINTMENT.GET_BY_ID, userID],
    queryFn: () => UserApi.getByID(userID),
    enabled: !!userID,
    retry: 0,
    ...options,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { user, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useUserMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const deleteUser = useMutation({
    mutationKey: [APPOINTMENT.DELETE],
    mutationFn: UserApi.delete,
    onMutate: async (userID) => {
      await queryClient.cancelQueries({ queryKey: [APPOINTMENT.GET_ALL] })

      const previousUsers = queryClient.getQueryData([APPOINTMENT.GET_ALL])
      queryClient.setQueryData([APPOINTMENT.GET_ALL], (oldUsers: User[]) =>
        oldUsers?.filter((user: User) => user.id !== userID),
      )

      return { previousUsers }
    },
    onSuccess: () => {
      toast({
        title: 'Utilisateur supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([APPOINTMENT.GET_ALL], context?.previousUsers)

      toast({
        title: "Erreur lors de la suppression de l'utilisateur",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    },
  })

  const updateUser = useMutation({
    mutationKey: [APPOINTMENT.UPDATE],
    mutationFn: UserApi.update,
    onMutate: async (updatedUser: UpdateUserParams) => {
      await queryClient.cancelQueries({ queryKey: [APPOINTMENT.GET_ALL] })

      const previousUsers = queryClient.getQueryData([APPOINTMENT.GET_ALL])
      queryClient.setQueryData([APPOINTMENT.GET_ALL], (oldUsers: User[]) =>
        oldUsers?.map((user: User) =>
          user.id === updatedUser.id ? updatedUser : user,
        ),
      )

      return { previousUsers }
    },
    onSuccess: () => {
      toast({
        title: 'Utilisateur modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([APPOINTMENT.GET_ALL], context?.previousUsers)

      toast({
        title: "Erreur lors de la mise à jour de l'utilisateur",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    },
  })

  return { deleteUser, updateUser }
}

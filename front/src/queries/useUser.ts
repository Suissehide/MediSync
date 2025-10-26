import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { APPOINTMENT } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { UserApi } from '../api/user.ts'
import type { User, UpdateUserParams } from '../types/auth.ts'

// * QUERIES

export const useAllUsersQuery = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING

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

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { users, isPending, isError, error }
}

export const useUserByIDQuery = (userID: string, options = {}) => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING

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

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { user, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useUserMutations = () => {
  const queryClient = useQueryClient()

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
    onError: (_, __, context) => {
      queryClient.setQueryData([APPOINTMENT.GET_ALL], context?.previousUsers)
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
    onError: (_, __, context) => {
      queryClient.setQueryData([APPOINTMENT.GET_ALL], context?.previousUsers)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    },
  })

  useDataFetching({
    isPending: updateUser.isPending,
    isError: updateUser.isError,
    error: updateUser.error,
    errorMessage: 'Erreur lors de la modification du rendez-vous',
  })

  useDataFetching({
    isPending: deleteUser.isPending,
    isError: deleteUser.isError,
    error: deleteUser.error,
    errorMessage: 'Erreur lors de la suppression du rendez-vous',
  })

  return { deleteUser, updateUser }
}

import { useMutation } from '@tanstack/react-query'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { AuthApi } from '../api/auth.api.ts'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import type { LoginInput } from '../types/auth.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import { useNavigate, useRouter } from '@tanstack/react-router'

// * QUERIES

// * MUTATIONS

export const useLogin = () => {
  const navigate = useNavigate()
  const authenticate = useAuthStore((state) => state.authenticate)

  const {
    mutate: loginMutation,
    data: credentials,
    isPending,
    error,
    isError,
  } = useMutation({
    mutationFn: async ({ email, password }: LoginInput) => {
      return await AuthApi.login(email, password)
    },
    onSuccess: async (user) => {
      if (!user) {
        return
      }
      authenticate(user)

      const redirect = new URLSearchParams(window.location.search).get(
        'redirect',
      )
      await navigate({ to: redirect || '/dashboard' })
    },
    retry: 0,
  })

  const errorMessageText =
    isError && error instanceof Error
      ? error.message
      : AUTH_MESSAGES.ERROR_FETCHING

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { loginMutation, credentials, isPending, error, errorMessageText }
}

export const useLogout = () => {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)

  const {
    mutate: logoutMutation,
    isPending,
    error,
    isError,
  } = useMutation({
    mutationFn: async () => {
      return await AuthApi.logout()
    },
    onSuccess: () => {
      logout()
      const redirect = new URLSearchParams(window.location.search).get(
        'redirect',
      )
      router.navigate({ to: redirect || '/auth/login' })
    },
    retry: 0,
  })

  const errorMessageText =
    isError && error instanceof Error
      ? error.message
      : AUTH_MESSAGES.ERROR_FETCHING

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { logoutMutation, isPending, error, errorMessageText }
}

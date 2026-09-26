import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { AuthApi } from '../api/auth.api.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import type { LoginInput, RegisterInput } from '../types/auth.ts'

// * QUERIES

// * MUTATIONS

export const useLogin = () => {
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
    onSuccess: (user) => {
      if (!user) {
        return
      }
      authenticate(user)
    },
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { loginMutation, credentials, isPending, error }
}

export const useLogout = () => {
  const router = useRouter()
  const queryClient = useQueryClient()
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
      // Tour de correction 1, Important n°3 : `hooks/useTenantSwitch.ts` ne
      // construit un `QueryClient` neuf que si `tenantKey(context)` change,
      // et ce couple vaut la chaîne vide pour TOUT compte qui n'a jamais
      // posé de contexte de tenant (super-admin sans établissement, par
      // exemple) — deux comptes de ce type qui se succèdent partageraient
      // donc le même client, et le cache du premier resterait lisible par
      // le second. Vider le cache ACTIF (celui que fournit
      // `QueryClientProvider` à l'instant de cet appel) ferme ce trou sans
      // dépendre de la clé de tenant : sûr même quand un client neuf allait
      // de toute façon être construit juste après.
      queryClient.clear()
      logout()
      const redirect = new URLSearchParams(window.location.search).get(
        'redirect',
      )
      router.navigate({ to: redirect || '/auth' })
    },
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { logoutMutation, isPending, error }
}

export const useUpdateMe = () => {
  const update = useAuthStore((state) => state.update)

  const mutation = useMutation({
    mutationFn: async (params: {
      firstName?: string
      lastName?: string
      currentPassword?: string
      newPassword?: string
    }) => {
      return await AuthApi.updateMe(params)
    },
    onSuccess: (user) => {
      update(user)
    },
    retry: 0,
  })

  useDataFetching({
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  })

  return mutation
}

export const useRegister = () => {
  const {
    mutate: registerMutation,
    isPending,
    error,
    isError,
  } = useMutation({
    mutationFn: async (registerInput: RegisterInput) => {
      return await AuthApi.register(registerInput)
    },
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { registerMutation, isPending, error }
}

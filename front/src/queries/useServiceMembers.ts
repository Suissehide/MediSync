import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ServiceMembersApi } from '../api/serviceMembers.api.ts'
import { SERVICE_MEMBER } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'

// Membres du service courant (2026-09-29) — cle sans tenant, comme toutes les autres : le
// cloisonnement vient du client de requetes neuf par service (voir `useTenantSwitch.ts`).
export const useServiceMembersQuery = () => {
  const {
    data: members,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SERVICE_MEMBER.GET_ALL],
    queryFn: ServiceMembersApi.getAll,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { members, isPending }
}

export const useServiceMemberMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const setSoignant = useMutation({
    mutationKey: [SERVICE_MEMBER.SET_SOIGNANT],
    mutationFn: ServiceMembersApi.setSoignant,
    onError: (error) => {
      toast({
        title: 'Erreur lors du rattachement',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [SERVICE_MEMBER.GET_ALL],
      })
    },
  })

  // MDS-17. L'INVITATION NE VIT QUE DANS LE CACHE DE MUTATION : son lien de premiere connexion
  // est un mot de passe a usage unique, il ne doit jamais entrer dans une cle de REQUETE (que
  // n'importe quel ecran pourrait relire). Meme regle que `createMemberAccount`
  // (`useMembers.ts`). Pas de toast de succes : le lien s'affiche dans la popup.
  const inviteMember = useMutation({
    mutationKey: [SERVICE_MEMBER.INVITE],
    mutationFn: ServiceMembersApi.invite,
    onError: (error) => {
      toast({
        title: "Erreur lors de l'invitation",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [SERVICE_MEMBER.GET_ALL],
      })
    },
  })

  const setRole = useMutation({
    mutationKey: [SERVICE_MEMBER.SET_ROLE],
    mutationFn: ServiceMembersApi.setRole,
    onError: (error) => {
      toast({
        title: 'Erreur lors du changement de rôle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [SERVICE_MEMBER.GET_ALL],
      })
    },
  })

  const removeMember = useMutation({
    mutationKey: [SERVICE_MEMBER.REMOVE],
    mutationFn: ServiceMembersApi.remove,
    onError: (error) => {
      toast({
        title: 'Erreur lors du retrait',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [SERVICE_MEMBER.GET_ALL],
      })
    },
  })

  return { setSoignant, inviteMember, setRole, removeMember }
}

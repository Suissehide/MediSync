import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { MembersApi } from '../api/members.api.ts'
import { MEMBER } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { AddMemberInput, UpdateMemberInput } from '../types/member.ts'

// * QUERIES

// `enabled` permet à l'écran de ne pas déclencher la requête (qui exige
// `members:manage` côté back, sans mode lecture seule) tant que la garde de
// permission n'a pas encore statué.
export const useMembersQuery = (options: { enabled?: boolean } = {}) => {
  const {
    data: members,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [MEMBER.GET_ALL],
    queryFn: MembersApi.getAll,
    retry: 0,
    enabled: options.enabled ?? true,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { members, isPending, error }
}

// * MUTATIONS

// Contrairement aux autres écrans de réglages, les mutations restent
// pessimistes (pas de mise à jour optimiste du cache) : l'ajout ne connaît
// pas l'identité du compte tant que le back n'a pas répondu (rattachement
// par e-mail), et les refus métier (dernier administrateur, action sur
// soi-même, compte multi-établissement...) sont fréquents sur cet écran :
// mieux vaut attendre la confirmation du serveur avant de modifier
// l'affichage.
export const useMemberMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [MEMBER.GET_ALL] })

  const addMember = useMutation({
    mutationKey: [MEMBER.ADD],
    mutationFn: (input: AddMemberInput) => MembersApi.add(input),
    onSuccess: () => {
      toast({ title: 'Membre ajouté', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'ajout du membre",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  const updateMember = useMutation({
    mutationKey: [MEMBER.UPDATE],
    mutationFn: (input: UpdateMemberInput) => MembersApi.update(input),
    onSuccess: () => {
      toast({ title: 'Membre modifié', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la modification du membre',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  const removeMember = useMutation({
    mutationKey: [MEMBER.REMOVE],
    mutationFn: (id: string) => MembersApi.remove(id),
    onSuccess: () => {
      toast({ title: 'Membre retiré', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors du retrait du membre',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  // Le brief ne prévoit qu'une clé `DEACTIVATE` pour ce couple d'actions
  // (activer/désactiver un même compte) : les deux mutations la partagent.
  const deactivateMember = useMutation({
    mutationKey: [MEMBER.DEACTIVATE],
    mutationFn: (id: string) => MembersApi.deactivate(id),
    onSuccess: () => {
      toast({ title: 'Compte désactivé', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la désactivation du compte',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  const reactivateMember = useMutation({
    mutationKey: [MEMBER.DEACTIVATE, 'reactivate'],
    mutationFn: (id: string) => MembersApi.reactivate(id),
    onSuccess: () => {
      toast({ title: 'Compte réactivé', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la réactivation du compte',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  return {
    addMember,
    updateMember,
    removeMember,
    deactivateMember,
    reactivateMember,
  }
}

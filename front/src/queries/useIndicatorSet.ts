import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { IndicatorSetApi } from '../api/indicatorSet.api.ts'
import { ACTIVITY, INDICATOR_SET } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  IndicatorAnswerBody,
  IndicatorDefinition,
} from '../types/indicatorSet.ts'

// Jeux actifs du service, dans l'ordre ; `enabled` laisse la barre de navigation n'interroger que sous un service.
export const useIndicatorSetsQuery = (enabled = true) => {
  const { data, isPending, error } = useQuery({
    queryKey: [INDICATOR_SET.LIST],
    queryFn: IndicatorSetApi.list,
    enabled,
  })
  return {
    sets: data
      ?.filter((set) => !set.archived)
      .sort((a, b) => a.order - b.order),
    isPending,
    error,
  }
}

export const useIndicatorResultsQuery = (
  setId: string,
  from: string,
  to: string,
) => {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [INDICATOR_SET.RESULTS, setId, from, to],
    queryFn: () => IndicatorSetApi.results(setId, from, to),
    retry: 0,
  })
  return {
    indicators: data?.indicators,
    manualYear: data?.manualYear ?? null,
    isPending,
    error,
    refetch,
  }
}

// Une saisie change l'année civile `manualYear` seulement, mais la clé porte `from`/`to` : tout le jeu est invalidé.
export const useSaveIndicatorAnswerMutation = (setId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      year,
      indicatorId,
      body,
    }: {
      year: number
      indicatorId: string
      body: IndicatorAnswerBody
    }) => IndicatorSetApi.saveAnswer(setId, year, indicatorId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [INDICATOR_SET.RESULTS, setId],
      })
    },
  })
}

// Tous les jeux, supprimés compris, dans l'ordre : l'écran de configuration les montre et les réordonne tous.
export const useAllIndicatorSetsQuery = () => {
  const { data, isPending } = useQuery({
    queryKey: [INDICATOR_SET.LIST],
    queryFn: IndicatorSetApi.list,
  })
  return {
    sets: data
      ?.map((set) => ({
        ...set,
        indicators: [...set.indicators].sort((a, b) => a.order - b.order),
      }))
      .sort((a, b) => a.order - b.order),
    isPending,
  }
}

export const useIndicatorCatalogQuery = () => {
  const { data } = useQuery({
    queryKey: [INDICATOR_SET.CATALOG],
    queryFn: IndicatorSetApi.catalog,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return { catalog: data ?? [] }
}

const DELAI_APERCU = 500

// L'aperçu attend une pause de saisie ; un 400 (définition incomplète) reste dans `isError`, sans toast.
export const useIndicatorPreviewQuery = (
  setId: string,
  definition: IndicatorDefinition | null,
  from: string,
  to: string,
) => {
  const [stable, setStable] = useState<{
    cle: string
    definition: IndicatorDefinition
  } | null>(null)
  const courante = useRef(definition)
  courante.current = definition
  const cle = JSON.stringify(definition)
  useEffect(() => {
    const minuteur = setTimeout(() => {
      const d = courante.current
      setStable(d === null ? null : { cle, definition: d })
    }, DELAI_APERCU)
    return () => clearTimeout(minuteur)
  }, [cle])
  return useQuery({
    queryKey: [INDICATOR_SET.PREVIEW, setId, stable?.cle, from, to],
    queryFn: () =>
      stable === null
        ? Promise.reject(new Error('Aucune définition'))
        : IndicatorSetApi.preview(setId, stable.definition, from, to),
    enabled: stable !== null,
    retry: 0,
  })
}

export const useIndicatorSetMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const options = <TVariables, TData>(
    mutationFn: (variables: TVariables) => Promise<TData>,
    errorTitle: string,
    onSuccess?: (variables: TVariables) => void,
  ) => ({
    mutationFn,
    onSuccess: (_data: TData, variables: TVariables) => onSuccess?.(variables),
    onError: (error: Error) => {
      toast({
        title: errorTitle,
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [INDICATOR_SET.LIST] }),
        queryClient.invalidateQueries({ queryKey: [INDICATOR_SET.RESULTS] }),
      ])
    },
  })

  const archivage = (archived: boolean | undefined, nom: string) => {
    if (archived !== undefined) {
      toast({
        title: `${nom} ${archived ? 'supprimé' : 'restauré'}`,
        severity: TOAST_SEVERITY.SUCCESS,
      })
    }
  }

  return {
    createSet: useMutation(
      options(IndicatorSetApi.createSet, 'Erreur lors de la création du jeu'),
    ),
    updateSet: useMutation(
      options(
        IndicatorSetApi.updateSet,
        'Erreur lors de la modification du jeu',
        (v) => archivage(v.archived, 'Jeu'),
      ),
    ),
    reorderSets: useMutation(
      options(
        IndicatorSetApi.reorderSets,
        'Erreur lors du réordonnancement des jeux',
      ),
    ),
    createIndicator: useMutation(
      options(
        IndicatorSetApi.createIndicator,
        "Erreur lors de la création de l'indicateur",
      ),
    ),
    updateIndicator: useMutation(
      options(
        IndicatorSetApi.updateIndicator,
        "Erreur lors de la modification de l'indicateur",
        (v) => archivage(v.body.archived, 'Indicateur'),
      ),
    ),
    reorderIndicators: useMutation(
      options(
        IndicatorSetApi.reorderIndicators,
        'Erreur lors du réordonnancement des indicateurs',
      ),
    ),
  }
}

export const useActivitySettingsQuery = () => {
  const { data } = useQuery({
    queryKey: [INDICATOR_SET.ACTIVITY_SETTINGS],
    queryFn: IndicatorSetApi.activitySettings,
  })
  return { settings: data }
}

export const useUpdateActivitySettingsMutation = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: IndicatorSetApi.updateActivitySettings,
    onSuccess: () =>
      toast({
        title: "Réglages de l'Activité enregistrés",
        severity: TOAST_SEVERITY.SUCCESS,
      }),
    onError: (error: Error) =>
      toast({
        title: "Erreur lors de l'enregistrement des réglages",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [INDICATOR_SET.ACTIVITY_SETTINGS],
        }),
        queryClient.invalidateQueries({ queryKey: [ACTIVITY.GET] }),
      ])
    },
  })
}

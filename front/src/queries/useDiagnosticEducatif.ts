import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  DiagnosticEducatifApi,
  DiagnosticEducatifTemplateApi,
} from '../api/diagnosticEducatif.api.ts'
import { undoToastAction } from '../components/custom/undoToastAction.tsx'
import {
  DIAGNOSTIC_EDUCATIF,
  DIAGNOSTIC_EDUCATIF_TEMPLATE,
} from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateDiagnosticEducatifParams,
  CreateDiagnosticEducatifTemplateParams,
  DiagnosticEducatif,
  UpdateDiagnosticEducatifParams,
  UpdateDiagnosticEducatifTemplateParams,
} from '../types/diagnosticEducatif.ts'

export const useDiagnosticsByPatientQuery = (patientId: string) => {
  const {
    data: diagnostics,
    isPending,
    isError,
    error,
  } = useQuery<DiagnosticEducatif[]>({
    queryKey: [DIAGNOSTIC_EDUCATIF.GET_BY_PATIENT, patientId],
    queryFn: () => DiagnosticEducatifApi.getByPatient(patientId),
    enabled: !!patientId,
    retry: 0,
  })
  useDataFetching({ isPending, isError, error })
  return { diagnostics, isPending }
}

export const useDiagnosticTemplatesQuery = (archived = false) => {
  const {
    data: templates,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [DIAGNOSTIC_EDUCATIF_TEMPLATE.GET_ALL, archived],
    queryFn: () => DiagnosticEducatifTemplateApi.getAll(archived),
    retry: 0,
  })
  useDataFetching({ isPending, isError, error })
  return { templates, isPending }
}

export const useDiagnosticMutations = (patientId: string) => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const queryKey = [DIAGNOSTIC_EDUCATIF.GET_BY_PATIENT, patientId]

  const createDiagnostic = useMutation({
    mutationFn: (params: CreateDiagnosticEducatifParams) =>
      DiagnosticEducatifApi.create(params),
    onSuccess: () => {
      toast({ title: 'Diagnostic créé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la création',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })

  const updateDiagnostic = useMutation({
    mutationFn: (params: UpdateDiagnosticEducatifParams) =>
      DiagnosticEducatifApi.update(params),
    onSuccess: () => {
      toast({
        title: 'Diagnostic mis à jour',
        severity: TOAST_SEVERITY.SUCCESS,
      })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la mise à jour',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })

  const deleteDiagnostic = useMutation({
    mutationFn: ({ diagnosticId }: { diagnosticId: string }) =>
      DiagnosticEducatifApi.delete(patientId, diagnosticId),
    onSuccess: () => {
      toast({ title: 'Diagnostic supprimé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la suppression',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })

  return { createDiagnostic, updateDiagnostic, deleteDiagnostic }
}

export const useDiagnosticTemplateMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const queryKey = [DIAGNOSTIC_EDUCATIF_TEMPLATE.GET_ALL]

  const createTemplate = useMutation({
    mutationFn: (params: CreateDiagnosticEducatifTemplateParams) =>
      DiagnosticEducatifTemplateApi.create(params),
    onSuccess: () => {
      toast({ title: 'Template créé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      toast({
        title: 'Erreur',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      }),
  })

  const updateTemplate = useMutation({
    mutationFn: (params: UpdateDiagnosticEducatifTemplateParams) =>
      DiagnosticEducatifTemplateApi.update(params),
    onSuccess: () => {
      toast({ title: 'Template mis à jour', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      toast({
        title: 'Erreur',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      }),
  })

  const restoreTemplate = useMutation({
    mutationKey: [DIAGNOSTIC_EDUCATIF_TEMPLATE.RESTORE],
    mutationFn: (id: string) =>
      DiagnosticEducatifTemplateApi.update({ id, archived: false }),
    onSuccess: () => {
      toast({ title: 'Modèle restauré', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      toast({
        title: 'Erreur lors de la restauration du modèle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      }),
  })

  const archiveTemplate = useMutation({
    mutationKey: [DIAGNOSTIC_EDUCATIF_TEMPLATE.ARCHIVE],
    mutationFn: (id: string) => DiagnosticEducatifTemplateApi.archive(id),
    onSuccess: (_, id) => {
      toast({
        title: 'Modèle archivé',
        message: 'Les diagnostics déjà remplis le conservent.',
        severity: TOAST_SEVERITY.SUCCESS,
        action: undoToastAction(() => restoreTemplate.mutate(id)),
      })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      toast({
        title: 'Erreur lors de l’archivage du modèle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      }),
  })

  // Suppression definitive, depuis la liste archivee. Le serveur refuse en 409
  // tant que des diagnostics portent encore ce modele, et son message le dit.
  const deleteForeverTemplate = useMutation({
    mutationKey: [DIAGNOSTIC_EDUCATIF_TEMPLATE.DELETE_FOREVER],
    mutationFn: (id: string) => DiagnosticEducatifTemplateApi.deleteForever(id),
    onSuccess: () => {
      toast({
        title: 'Modèle supprimé définitivement',
        severity: TOAST_SEVERITY.SUCCESS,
      })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      toast({
        title: 'Suppression impossible',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      }),
  })

  return {
    createTemplate,
    updateTemplate,
    archiveTemplate,
    restoreTemplate,
    deleteForeverTemplate,
  }
}

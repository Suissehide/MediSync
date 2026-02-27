import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DiagnosticEducatifApi, DiagnosticEducatifTemplateApi } from '../api/diagnosticEducatif.api.ts'
import { DIAGNOSTIC_EDUCATIF, DIAGNOSTIC_EDUCATIF_TEMPLATE } from '../constants/process.constant.ts'
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
  const { data: diagnostics, isPending, isError, error } = useQuery<DiagnosticEducatif[]>({
    queryKey: [DIAGNOSTIC_EDUCATIF.GET_BY_PATIENT, patientId],
    queryFn: () => DiagnosticEducatifApi.getByPatient(patientId),
    enabled: !!patientId,
    retry: 0,
  })
  useDataFetching({ isPending, isError, error })
  return { diagnostics, isPending }
}

export const useDiagnosticTemplatesQuery = () => {
  const { data: templates, isPending, isError, error } = useQuery({
    queryKey: [DIAGNOSTIC_EDUCATIF_TEMPLATE.GET_ALL],
    queryFn: DiagnosticEducatifTemplateApi.getAll,
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
    mutationFn: (params: CreateDiagnosticEducatifParams) => DiagnosticEducatifApi.create(params),
    onSuccess: () => {
      toast({ title: 'Diagnostic créé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({ title: 'Erreur lors de la création', message: error.message, severity: TOAST_SEVERITY.ERROR })
    },
  })

  const updateDiagnostic = useMutation({
    mutationFn: (params: UpdateDiagnosticEducatifParams) => DiagnosticEducatifApi.update(params),
    onSuccess: () => {
      toast({ title: 'Diagnostic mis à jour', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({ title: 'Erreur lors de la mise à jour', message: error.message, severity: TOAST_SEVERITY.ERROR })
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
      toast({ title: 'Erreur lors de la suppression', message: error.message, severity: TOAST_SEVERITY.ERROR })
    },
  })

  return { createDiagnostic, updateDiagnostic, deleteDiagnostic }
}

export const useDiagnosticTemplateMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const queryKey = [DIAGNOSTIC_EDUCATIF_TEMPLATE.GET_ALL]

  const createTemplate = useMutation({
    mutationFn: (params: CreateDiagnosticEducatifTemplateParams) => DiagnosticEducatifTemplateApi.create(params),
    onSuccess: () => {
      toast({ title: 'Template créé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast({ title: 'Erreur', message: error.message, severity: TOAST_SEVERITY.ERROR }),
  })

  const updateTemplate = useMutation({
    mutationFn: (params: UpdateDiagnosticEducatifTemplateParams) => DiagnosticEducatifTemplateApi.update(params),
    onSuccess: () => {
      toast({ title: 'Template mis à jour', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast({ title: 'Erreur', message: error.message, severity: TOAST_SEVERITY.ERROR }),
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => DiagnosticEducatifTemplateApi.delete(id),
    onSuccess: () => {
      toast({ title: 'Template supprimé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast({ title: 'Erreur', message: error.message, severity: TOAST_SEVERITY.ERROR }),
  })

  return { createTemplate, updateTemplate, deleteTemplate }
}

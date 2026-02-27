import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateDiagnosticEducatifParams,
  CreateDiagnosticEducatifTemplateParams,
  DiagnosticEducatif,
  DiagnosticEducatifTemplate,
  UpdateDiagnosticEducatifParams,
  UpdateDiagnosticEducatifTemplateParams,
} from '../types/diagnosticEducatif.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const DiagnosticEducatifApi = {
  getByPatient: async (patientId: string): Promise<DiagnosticEducatif[]> => {
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic`, { method: 'GET' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de récupérer les diagnostics')
    return res.json()
  },

  getByID: async (patientId: string, diagnosticId: string): Promise<DiagnosticEducatif> => {
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic/${diagnosticId}`, { method: 'GET' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de récupérer le diagnostic')
    return res.json()
  },

  create: async (params: CreateDiagnosticEducatifParams): Promise<DiagnosticEducatif> => {
    const { patientId, ...body } = params
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de créer le diagnostic')
    return res.json()
  },

  update: async (params: UpdateDiagnosticEducatifParams): Promise<DiagnosticEducatif> => {
    const { id, patientId, ...body } = params
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de mettre à jour le diagnostic')
    return res.json()
  },

  delete: async (patientId: string, diagnosticId: string): Promise<void> => {
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic/${diagnosticId}`, { method: 'DELETE' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de supprimer le diagnostic')
  },
}

export const DiagnosticEducatifTemplateApi = {
  getAll: async (): Promise<DiagnosticEducatifTemplate[]> => {
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template`, { method: 'GET' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de récupérer les templates')
    return res.json()
  },

  create: async (params: CreateDiagnosticEducatifTemplateParams): Promise<DiagnosticEducatifTemplate> => {
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de créer le template')
    return res.json()
  },

  update: async (params: UpdateDiagnosticEducatifTemplateParams): Promise<DiagnosticEducatifTemplate> => {
    const { id, ...body } = params
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de mettre à jour le template')
    return res.json()
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template/${id}`, { method: 'DELETE' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de supprimer le template')
  },
}

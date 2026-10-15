import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError, messageDuServeur } from '../libs/httpErrorHandler.ts'
import type {
  CreatePdfDesignPresetParams,
  PdfDesignPreset,
  UpdatePdfDesignPresetParams,
} from '../types/pdfDesignPreset.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Le super-admin est hors de tout tenant : ni `tenantApiUrl()` ni `establishmentApiUrl()`,
// qui exigent un contexte pose par un layout de tenant et leveraient ici. Un prefixe fixe,
// comme les autres routes hors tenant.
const PRESETS_URL = () => `${apiUrl}/super-admin/pdf-design-presets`

export const PdfDesignPresetApi = {
  getAll: async (archived = false): Promise<PdfDesignPreset[]> => {
    const response = await fetchWithAuth(
      `${PRESETS_URL()}?archived=${archived}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les modèles')
    }
    return response.json()
  },

  create: async (
    params: CreatePdfDesignPresetParams,
  ): Promise<PdfDesignPreset> => {
    const response = await fetchWithAuth(PRESETS_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer le modèle')
    }
    return response.json()
  },

  // L'identifiant reste dans le chemin : le corps ne porte que ce qui change.
  update: async ({
    id,
    ...champs
  }: UpdatePdfDesignPresetParams): Promise<PdfDesignPreset> => {
    const response = await fetchWithAuth(`${PRESETS_URL()}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le modèle')
    }
    return response.json()
  },

  archive: async (presetID: string): Promise<void> => {
    const response = await fetchWithAuth(`${PRESETS_URL()}/${presetID}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le modèle')
    }
  },

  // La liste ENTIERE, dans le nouvel ordre : le back refuse tout ce qui ne decrit pas
  // exactement l'ensemble existant.
  reorder: async (ids: string[]): Promise<void> => {
    const response = await fetchWithAuth(`${PRESETS_URL()}/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!response.ok) {
      // Le serveur dit CE QUI ne va pas dans la liste ; un libelle generique ne le dirait
      // pas (lecon de l'etape 4).
      const message = await messageDuServeur(response)
      handleHttpError(
        response,
        message
          ? { 400: { title: 'Réordonnancement impossible', message } }
          : {},
        'Impossible de réordonner les modèles',
      )
    }
  },
}

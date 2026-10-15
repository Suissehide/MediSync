import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError, messageDuServeur } from '../libs/httpErrorHandler.ts'
import type {
  CreatePdfAssetParams,
  PdfAssetBytes,
  PdfAssetSummary,
} from '../types/pdfAsset.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Meme borne que le schema du back. Elle est verifiee ICI aussi, et ce n'est pas une
// redondance decorative : au-dela de la limite de corps de Fastify, le refus arrive AVANT le
// schema, donc sans le message qui nomme la limite. Le seul moyen d'expliquer un fichier de
// 10 Mo est de ne pas le televerser.
export const TAILLE_MAXIMALE_IMAGE = 2 * 1024 * 1024

// Ce que recoivent les deux moteurs de rendu : jamais une URL, toujours les octets.
export const dataUri = ({ mimeType, base64 }: PdfAssetBytes): string =>
  `data:${mimeType};base64,${base64}`

// `FileReader` rend une data URI complete ; le back attend le base64 nu, et c'est lui qui
// verifie la signature des octets.
export const lireEnBase64 = (fichier: File): Promise<string> => {
  if (fichier.size > TAILLE_MAXIMALE_IMAGE) {
    return Promise.reject(
      new Error('Cette image dépasse la taille maximale de 2 Mo'),
    )
  }
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error('Fichier illisible'))
    lecteur.onload = () => {
      const resultat = String(lecteur.result)
      const virgule = resultat.indexOf(',')
      resolve(virgule >= 0 ? resultat.slice(virgule + 1) : resultat)
    }
    lecteur.readAsDataURL(fichier)
  })
}

export const PdfAssetApi = {
  getAll: async (): Promise<PdfAssetSummary[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-assets`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les images')
    }
    return response.json()
  },

  getBytes: async (assetID: string): Promise<PdfAssetBytes> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-assets/${assetID}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de récupérer l'image")
    }
    return response.json()
  },

  create: async (params: CreatePdfAssetParams): Promise<PdfAssetSummary> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      // Le serveur dit CE QUI bloque (« dépasse 2 Mo », « ne ressemble pas à une image
      // image/png ») ; sans ce passage, l'utilisateur ne lit que « le serveur n'a pas pu
      // traiter la requête », qui ne nomme ni la taille ni le type.
      const message = await messageDuServeur(response)
      handleHttpError(
        response,
        message ? { 400: { title: 'Dépôt impossible', message } } : {},
        "Impossible de déposer l'image",
      )
    }
    return response.json()
  },

  remove: async (assetID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-assets/${assetID}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      // Le 409 NOMME les designs qui utilisent l'image : c'est toute la valeur du refus, et
      // un libelle generique le perdrait.
      const message = await messageDuServeur(response)
      handleHttpError(
        response,
        message ? { 409: { title: 'Suppression impossible', message } } : {},
        "Impossible de supprimer l'image",
      )
    }
  },
}

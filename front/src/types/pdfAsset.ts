export type PdfAssetSummary = {
  id: string
  fileName: string
  mimeType: string
}

export type PdfAssetBytes = {
  mimeType: string
  base64: string
}

export type CreatePdfAssetParams = {
  fileName: string
  mimeType: string
  base64: string
}

// Les octets, deja resolus, que les deux moteurs de rendu recoivent : assetId -> data URI.
// Jamais une URL : `render-pdf` tourne hors React et ne peut pas lire un cache react-query,
// et une sous-ressource n'emporte pas forcement le cookie d'authentification.
export type SourcesImages = Record<string, string>

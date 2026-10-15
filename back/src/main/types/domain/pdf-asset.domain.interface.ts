export type PdfAssetSummaryDomain = {
  id: string
  fileName: string
  mimeType: string
}

export type PdfAssetBytesDomain = {
  mimeType: string
  base64: string
}

export type PdfAssetCreateDomain = {
  fileName: string
  mimeType: string
  base64: string
}

export interface PdfAssetDomainInterface {
  create: (params: PdfAssetCreateDomain) => Promise<PdfAssetSummaryDomain>
  findAllForService: () => Promise<PdfAssetSummaryDomain[]>
  findByID: (assetID: string) => Promise<PdfAssetBytesDomain>
  // Refuse (409) tant qu'un design du service porte cet identifiant.
  remove: (assetID: string) => Promise<void>
}

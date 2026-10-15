import type { PdfAsset } from '../../../../../generated/client'

export type PdfAssetEntityRepo = PdfAsset

export type PdfAssetSummaryEntityRepo = Pick<
  PdfAsset,
  'id' | 'fileName' | 'mimeType'
>

export type PdfAssetCreateEntityRepo = {
  fileName: string
  mimeType: string
  // `Uint8Array<ArrayBuffer>` et non `Buffer` : la colonne Bytes de Prisma 7 refuse un
  // tampon potentiellement partage (`SharedArrayBuffer`), ce qu'est un `Buffer` pour TS.
  bytes: Uint8Array<ArrayBuffer>
}

export interface PdfAssetRepositoryInterface {
  // Rend le resume, pas la ligne : relire les octets qu'on vient d'ecrire ne sert a rien.
  create: (
    params: PdfAssetCreateEntityRepo,
  ) => Promise<PdfAssetSummaryEntityRepo>
  // Sans les octets : cette liste nourrit un selecteur, pas un rendu.
  findAllForService: () => Promise<PdfAssetSummaryEntityRepo[]>
  findByID: (assetID: string) => Promise<PdfAssetEntityRepo | null>
  // Existence dans le service courant, sans charger les octets.
  existe: (assetID: string) => Promise<boolean>
  remove: (assetID: string) => Promise<void>
}
